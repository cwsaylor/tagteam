import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { nanoid } from "nanoid";
import { runClaude } from "./agents/claude.js";
import { runCodex } from "./agents/codex.js";
import type { AgentName } from "./agents/types.js";
import { formatAsMarkdown } from "./format.js";
import { copyToClipboard } from "./clipboard.js";
import { createSession, touchSession, updateSessionTitle } from "./db/sessions.js";
import { insertMessage, getMessages } from "./db/messages.js";
import { closeDb } from "./db/index.js";
import {
  collaborationPrompt,
  discussionPrompt,
  debatePrompt,
  debateRoundPrompt,
  CONSENSUS_MARKER,
  formatConversationHistory,
} from "./prompts.js";
import type { WonderTwinsConfig } from "./config.js";

marked.use(markedTerminal() as any);

// --- Types ---

interface Message {
  role: "user" | "claude" | "codex" | "system";
  content: string;
  round: number;
  error?: boolean;
}

interface AppProps {
  initialPrompt?: string;
  sessionId?: string;
  claudeModel: string;
  codexModel: string;
  config: WonderTwinsConfig;
  showTranscript?: Message[];
  discuss?: boolean;
  maxDiscussionRounds?: number;
}

type AppState = "input" | "running" | "done";
type Target = "both" | "claude" | "codex";

interface ParsedInput {
  target: Target;
  prompt: string;
  discuss: boolean;
}

function parseInput(input: string): ParsedInput {
  const lower = input.toLowerCase();
  if (lower.startsWith("discuss ")) {
    return { target: "both", prompt: input.slice(8).trim(), discuss: true };
  }
  if (lower.startsWith("claude ") || lower.startsWith("claude, ")) {
    return { target: "claude", prompt: input.slice(input.indexOf(" ") + 1).trim(), discuss: false };
  }
  if (lower.startsWith("codex ") || lower.startsWith("codex, ")) {
    return { target: "codex", prompt: input.slice(input.indexOf(" ") + 1).trim(), discuss: false };
  }
  return { target: "both", prompt: input, discuss: false };
}

// --- Components ---

function RenderedMarkdown({ text }: { text: string }) {
  const rendered = (marked.parse(text) as string).trimEnd();
  return <Text>{rendered}</Text>;
}

function AgentResponseBlock({
  agent,
  content,
  error,
}: {
  agent: AgentName;
  content: string;
  error?: boolean;
}) {
  const color = agent === "claude" ? "magenta" : "green";

  if (error) {
    return (
      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Text color="red" bold>
          {agent === "claude" ? "Claude" : "Codex"} error:
        </Text>
        <Box marginLeft={1}>
          <Text color="red">{content}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginLeft={1} marginBottom={1}>
      <Text color={color} bold>
        {agent === "claude" ? "Claude" : "Codex"}:
      </Text>
      <Box marginLeft={1}>
        <RenderedMarkdown text={content} />
      </Box>
    </Box>
  );
}

function Header({ sessionId }: { sessionId: string }) {
  return (
    <Box marginBottom={1}>
      <Text dimColor>{"── "}</Text>
      <Text bold>Wonder Twins</Text>
      <Text dimColor>{" ── session "}</Text>
      <Text color="cyan">{sessionId.slice(0, 7)}</Text>
      <Text dimColor>{" " + "─".repeat(35)}</Text>
    </Box>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <Box marginLeft={1} marginBottom={1}>
      <Text bold color="white">
        You:{" "}
      </Text>
      <Text>{content}</Text>
    </Box>
  );
}

function ThinkingIndicator({ agent }: { agent: AgentName }) {
  const color = agent === "claude" ? "magenta" : "green";
  const label = agent === "claude" ? "Claude" : "Codex";
  return (
    <Box marginLeft={1}>
      <Text color={color}>
        <Spinner type="dots" />
      </Text>
      <Text color={color}> {label} is thinking...</Text>
    </Box>
  );
}

function DiscussionStatus({ round, maxRounds }: { round: number; maxRounds: number }) {
  return (
    <Box marginLeft={1} marginBottom={1}>
      <Text color="yellow" bold>
        Discussion round {round}/{maxRounds}
      </Text>
    </Box>
  );
}

function ConsensusReached() {
  return (
    <Box marginLeft={1} marginBottom={1}>
      <Text color="green" bold>
        Consensus reached.
      </Text>
    </Box>
  );
}

function PromptInput({
  onSubmit,
}: {
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(
    (submitted: string) => {
      if (submitted.trim()) {
        onSubmit(submitted.trim());
        setValue("");
      }
    },
    [onSubmit]
  );

  return (
    <Box marginLeft={1}>
      <Text bold color="white">
        {"> "}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        showCursor
      />
    </Box>
  );
}

// --- Main App ---

const MAX_DISCUSSION_ROUNDS = 10;

function App({
  initialPrompt,
  sessionId: existingSessionId,
  claudeModel,
  codexModel,
  showTranscript,
  discuss: initialDiscuss,
  maxDiscussionRounds = MAX_DISCUSSION_ROUNDS,
}: AppProps) {
  const { exit } = useApp();
  const [sessionId, setSessionId] = useState(() => existingSessionId ?? nanoid(12));
  const [messages, setMessages] = useState<Message[]>(showTranscript ?? []);
  const [state, setState] = useState<AppState>(
    initialPrompt ? "running" : "input"
  );
  const [thinkingAgents, setThinkingAgents] = useState<AgentName[]>([]);
  const [discussionRound, setDiscussionRound] = useState(0);
  const [consensusReached, setConsensusReached] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [roundNum, setRoundNum] = useState(() => {
    if (showTranscript && showTranscript.length > 0) {
      return Math.max(...showTranscript.map((m) => m.round)) + 1;
    }
    return 0;
  });

  // Create session on first mount if new
  useEffect(() => {
    if (!existingSessionId) {
      createSession(sessionId, process.cwd());
    }
  }, []);

  // Handle initial prompt
  useEffect(() => {
    if (initialPrompt && state === "running") {
      if (initialDiscuss) {
        runDiscussion(initialPrompt);
      } else {
        runRound(initialPrompt);
      }
    }
  }, []);

  // Ctrl+C handling
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      closeDb();
      exit();
    }
  });

  // Run both agents, save results, return new messages
  const runAgents = async (
    currentMessages: Message[],
    round: number,
    target: Target,
    promptOverride?: string,
    isDebate = false,
  ): Promise<Message[]> => {
    const runCl = target === "both" || target === "claude";
    const runCx = target === "both" || target === "codex";

    const activeAgents: AgentName[] = [];
    if (runCl) activeAgents.push("claude");
    if (runCx) activeAgents.push("codex");
    setThinkingAgents(activeAgents);

    const history = formatConversationHistory(
      currentMessages.map((m) => ({
        role: m.role,
        agent:
          m.role === "claude" || m.role === "codex"
            ? (m.role as AgentName)
            : undefined,
        content: m.content,
      }))
    );

    const cwd = process.cwd();
    const isFirstRound = round === 0 && !existingSessionId;

    const agentPrompt = (agent: AgentName) => {
      if (promptOverride) return promptOverride;
      if (isFirstRound && target === "both") {
        return currentMessages[currentMessages.length - 1]?.content || "";
      }
      return "Provide your response for this round.";
    };

    const agentSystemPrompt = (agent: AgentName) => {
      if (isDebate) {
        if (isFirstRound) return debatePrompt(agent);
        return debateRoundPrompt(agent, history);
      }
      if (isFirstRound && target === "both") return collaborationPrompt(agent);
      return discussionPrompt(agent, history);
    };

    const results: Array<{ agent: AgentName; result: PromiseSettledResult<Awaited<ReturnType<typeof runClaude>>> }> = [];
    const promises: Array<Promise<void>> = [];

    if (runCl) {
      promises.push(
        runClaude({
          prompt: agentPrompt("claude"),
          systemPrompt: agentSystemPrompt("claude"),
          model: claudeModel,
          cwd,
        }).then(
          (value) => { results.push({ agent: "claude", result: { status: "fulfilled", value } }); },
          (reason) => { results.push({ agent: "claude", result: { status: "rejected", reason } }); }
        )
      );
    }
    if (runCx) {
      promises.push(
        runCodex({
          prompt: agentPrompt("codex"),
          systemPrompt: agentSystemPrompt("codex"),
          model: codexModel,
          cwd,
        }).then(
          (value) => { results.push({ agent: "codex", result: { status: "fulfilled", value } }); },
          (reason) => { results.push({ agent: "codex", result: { status: "rejected", reason } }); }
        )
      );
    }

    await Promise.all(promises);
    setThinkingAgents([]);

    const newMessages: Message[] = [];

    for (const { agent, result } of results) {
      if (result.status === "fulfilled") {
        const resp = result.value;
        const msg: Message = {
          role: agent,
          content: resp.error || resp.text,
          round,
          error: !!resp.error,
        };
        newMessages.push(msg);
        insertMessage({
          sessionId,
          role: agent,
          content: resp.error || resp.text,
          round,
          durationMs: resp.durationMs,
        });
      } else {
        const errorMsg = result.reason?.message || "Failed to run";
        const msg: Message = {
          role: agent,
          content: errorMsg,
          round,
          error: true,
        };
        newMessages.push(msg);
        insertMessage({
          sessionId,
          role: agent,
          content: `[Error: ${errorMsg}]`,
          round,
        });
      }
    }

    return newMessages;
  };

  const runRound = async (rawInput: string) => {
    const { target, prompt, discuss } = parseInput(rawInput);

    if (discuss) {
      return runDiscussion(prompt);
    }

    const currentRound = roundNum;

    // Add user message
    const userMsg: Message = {
      role: "user",
      content: rawInput,
      round: currentRound,
    };
    setMessages((prev) => [...prev, userMsg]);
    insertMessage({
      sessionId,
      role: "user",
      content: rawInput,
      round: currentRound,
    });

    const allMessages = [...messages, userMsg];
    const newMessages = await runAgents(allMessages, currentRound, target);

    setMessages((prev) => [...prev, ...newMessages]);
    setRoundNum(currentRound + 1);

    if (currentRound === 0 && !existingSessionId) {
      const title = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      updateSessionTitle(sessionId, title);
    }

    touchSession(sessionId);
    setState("input");
  };

  const runDiscussion = async (prompt: string) => {
    setConsensusReached(false);
    let currentRound = roundNum;

    // Add user message
    const userMsg: Message = {
      role: "user",
      content: `discuss ${prompt}`,
      round: currentRound,
    };
    setMessages((prev) => [...prev, userMsg]);
    insertMessage({
      sessionId,
      role: "user",
      content: `discuss ${prompt}`,
      round: currentRound,
    });

    let allMessages = [...messages, userMsg];

    if (currentRound === 0 && !existingSessionId) {
      const title = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      updateSessionTitle(sessionId, title);
    }

    for (let disc = 1; disc <= maxDiscussionRounds; disc++) {
      setDiscussionRound(disc);

      const newMessages = await runAgents(
        allMessages,
        currentRound,
        "both",
        disc === 1 ? prompt : "Provide your response for this round.",
        true,
      );

      setMessages((prev) => [...prev, ...newMessages]);
      allMessages = [...allMessages, ...newMessages];
      currentRound++;

      // Check for consensus — both agents must include the marker
      const claudeMsg = newMessages.find((m) => m.role === "claude" && !m.error);
      const codexMsg = newMessages.find((m) => m.role === "codex" && !m.error);
      const claudeConsensus = claudeMsg?.content.includes(CONSENSUS_MARKER) ?? false;
      const codexConsensus = codexMsg?.content.includes(CONSENSUS_MARKER) ?? false;

      if (claudeConsensus && codexConsensus) {
        setConsensusReached(true);
        break;
      }
    }

    setRoundNum(currentRound);
    setDiscussionRound(0);
    touchSession(sessionId);
    setState("input");
  };

  const handleSubmit = (value: string) => {
    setStatusMessage(null);

    if (value === "/exit") {
      closeDb();
      exit();
      return;
    }

    if (value === "/new") {
      const newId = nanoid(12);
      createSession(newId, process.cwd());
      setSessionId(newId);
      setMessages([]);
      setRoundNum(0);
      setConsensusReached(false);
      setDiscussionRound(0);
      setStatusMessage("Started new session.");
      return;
    }

    if (value === "/copy") {
      try {
        const md = formatAsMarkdown(messages);
        copyToClipboard(md);
        setStatusMessage("Copied conversation to clipboard.");
      } catch {
        setStatusMessage("Failed to copy to clipboard.");
      }
      return;
    }

    setConsensusReached(false);
    setState("running");
    runRound(value);
  };

  return (
    <Box flexDirection="column">
      <Header sessionId={sessionId} />

      {messages.map((msg, i) => {
        if (msg.role === "user") {
          return <UserMessage key={i} content={msg.content} />;
        }
        if (msg.role === "claude" || msg.role === "codex") {
          return (
            <AgentResponseBlock
              key={i}
              agent={msg.role}
              content={msg.content}
              error={msg.error}
            />
          );
        }
        return null;
      })}

      {discussionRound > 0 && thinkingAgents.length > 0 && (
        <DiscussionStatus round={discussionRound} maxRounds={maxDiscussionRounds} />
      )}

      {thinkingAgents.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {thinkingAgents.map((agent) => (
            <ThinkingIndicator key={agent} agent={agent} />
          ))}
        </Box>
      )}

      {consensusReached && <ConsensusReached />}

      {statusMessage && (
        <Box marginLeft={1}>
          <Text dimColor italic>{statusMessage}</Text>
        </Box>
      )}

      {state === "input" && <PromptInput onSubmit={handleSubmit} />}
    </Box>
  );
}

// --- Entry points ---

export function startApp(props: AppProps) {
  return render(<App {...props} />);
}

export function showTranscriptMarkdown(sessionId: string): string {
  const dbMessages = getMessages(sessionId);
  const messages = dbMessages.map((m) => ({
    role: m.role as Message["role"],
    content: m.content,
    round: m.round,
  }));
  return formatAsMarkdown(messages);
}

export function showTranscript(sessionId: string): void {
  const dbMessages = getMessages(sessionId);
  const messages: Message[] = dbMessages.map((m) => ({
    role: m.role as Message["role"],
    content: m.content,
    round: m.round,
  }));

  const { unmount } = render(
    <Box flexDirection="column">
      <Header sessionId={sessionId} />
      {messages.map((msg, i) => {
        if (msg.role === "user") {
          return <UserMessage key={i} content={msg.content} />;
        }
        if (msg.role === "claude" || msg.role === "codex") {
          return (
            <AgentResponseBlock key={i} agent={msg.role} content={msg.content} />
          );
        }
        return null;
      })}
      <Box>
        <Text dimColor>{"─".repeat(60)}</Text>
      </Box>
    </Box>
  );

  unmount();
}

export function showSessionList(
  sessions: Array<{
    id: string;
    title: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>
): void {
  const { unmount } = render(
    <Box flexDirection="column">
      {sessions.length === 0 ? (
        <Text dimColor> No sessions found.</Text>
      ) : (
        sessions.map((s) => (
          <Box key={s.id} marginLeft={1}>
            <Text color="cyan">{s.id.slice(0, 7)}</Text>
            <Text>{"  "}</Text>
            <Text>{s.title || "(untitled)"}</Text>
            <Text>{"  "}</Text>
            <Text color={s.status === "active" ? "green" : undefined} dimColor={s.status !== "active"}>
              {s.status}
            </Text>
            <Text>{"  "}</Text>
            <Text dimColor>{s.updated_at}</Text>
          </Box>
        ))
      )}
    </Box>
  );

  unmount();
}
