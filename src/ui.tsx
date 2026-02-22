import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { nanoid } from "nanoid";
import type { AgentName, AgentResponse } from "./agents/types.js";
import { getAgent, getAllAgentNames, isValidAgentName } from "./agents/registry.js";
import { formatAsMarkdown } from "./format.js";
import { copyToClipboard } from "./clipboard.js";
import { createSession, touchSession, updateSessionTitle } from "./db/sessions.js";
import { insertMessage, getMessages, deleteMessagesFromRound } from "./db/messages.js";
import { closeDb } from "./db/index.js";
import {
  collaborationPrompt,
  discussionPrompt,
  debatePrompt,
  debateRoundPrompt,
  directPrompt,
  CONSENSUS_MARKER,
  formatConversationHistory,
} from "./prompts.js";
import { loadConfig } from "./config.js";
import type { TagTeamConfig } from "./config.js";
import { validateAgentPair } from "./agents/registry.js";
import { InlineConfigEditor } from "./config-editor.js";

marked.use(markedTerminal() as any);

// --- Types ---

interface Message {
  role: string;
  content: string;
  round: number;
  error?: boolean;
}

export interface AppProps {
  initialPrompt?: string;
  sessionId?: string;
  agents: [AgentName, AgentName];
  agentModels: Record<AgentName, string>;
  config: TagTeamConfig;
  showTranscript?: Message[];
  discuss?: boolean;
}

type AppState = "input" | "running" | "done" | "config";
type Target = "both" | AgentName | [AgentName, AgentName];

interface ParsedInput {
  target: Target;
  prompt: string;
  discuss: boolean;
}

const PAIR_SEPARATORS = /^(\w+)\s*(?:and|&|\/|,)\s*(\w+)[\s,]\s*/i;

function tryParsePair(text: string): { pair: [AgentName, AgentName]; rest: string } | null {
  const match = text.toLowerCase().match(PAIR_SEPARATORS);
  if (!match) return null;
  const [fullMatch, first, second] = match;
  if (isValidAgentName(first) && isValidAgentName(second) && first !== second) {
    return { pair: [first, second], rest: text.slice(fullMatch.length).trim() };
  }
  return null;
}

function parseInput(input: string): ParsedInput {
  const lower = input.toLowerCase();
  if (lower.startsWith("discuss ")) {
    const rest = input.slice(8).trim();
    // Check for "discuss gemini and codex ..."
    const adHoc = tryParsePair(rest);
    if (adHoc) {
      return { target: adHoc.pair, prompt: adHoc.rest, discuss: true };
    }
    return { target: "both", prompt: rest, discuss: true };
  }
  // Check for ad-hoc pair: "gemini and codex ...", "gemini/codex ...", etc.
  const adHoc = tryParsePair(input);
  if (adHoc) {
    // "gemini and codex discuss ..." — natural word order
    const adHocLower = adHoc.rest.toLowerCase();
    if (adHocLower.startsWith("discuss ")) {
      return { target: adHoc.pair, prompt: adHoc.rest.slice(8).trim(), discuss: true };
    }
    return { target: adHoc.pair, prompt: adHoc.rest, discuss: false };
  }
  // Check for single agent prefix
  for (const agent of getAllAgentNames()) {
    if (lower.startsWith(`${agent} `) || lower.startsWith(`${agent}, `)) {
      return { target: agent, prompt: input.slice(input.indexOf(" ") + 1).trim(), discuss: false };
    }
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
  const descriptor = getAgent(agent);

  if (error) {
    return (
      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Text color="red" bold>
          {descriptor.displayName} error:
        </Text>
        <Box marginLeft={1}>
          <Text color="red">{content}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginLeft={1} marginBottom={1}>
      <Text color={descriptor.color} bold>
        {descriptor.displayName}:
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
      <Text bold>Tag Team</Text>
      <Text dimColor>{" ── session "}</Text>
      <Text color="cyan">{sessionId.slice(0, 7)}</Text>
      <Text dimColor>{" " + "─".repeat(35)}</Text>
    </Box>
  );
}

function QuickHelp() {
  const col = 38;
  const examples = [
    ["ask anything", "sends to both agents"],
    ["gemini explain this", "sends to one agent"],
    ["discuss best approach", "multi-round debate"],
    ["gemini and codex discuss review app", "pick agents + debate"],
  ];
  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={1}>
      {examples.map(([cmd, desc]) => (
        <Text key={cmd} dimColor>{cmd!.padEnd(col)}{"→ "}{desc}</Text>
      ))}
      <Text dimColor>{"  /help for more"}</Text>
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
  const descriptor = getAgent(agent);
  return (
    <Box marginLeft={1}>
      <Text color={descriptor.color}>
        <Spinner type="dots" />
      </Text>
      <Text color={descriptor.color}> {descriptor.displayName} is thinking...</Text>
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

function App({
  initialPrompt,
  sessionId: existingSessionId,
  agents: initialPair,
  agentModels: initialAgentModels,
  config: initialConfig,
  showTranscript,
  discuss: initialDiscuss,
}: AppProps) {
  const { exit } = useApp();
  const [sessionId, setSessionId] = useState(() => existingSessionId ?? nanoid(12));
  const [messages, setMessages] = useState<Message[]>(showTranscript ?? []);
  const [state, setState] = useState<AppState>(
    initialPrompt ? "running" : "input"
  );
  const [pair, setPair] = useState<[AgentName, AgentName]>(initialPair);
  const [agentModels, setAgentModels] = useState<Record<AgentName, string>>(initialAgentModels);
  const [config, setConfig] = useState<TagTeamConfig>(initialConfig);
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

  const sessionCreatedRef = useRef(!!existingSessionId);
  const ensureSession = (id: string) => {
    if (!sessionCreatedRef.current) {
      createSession(id, process.cwd());
      sessionCreatedRef.current = true;
    }
  };

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

  const abortRef = useRef<AbortController | null>(null);
  const runningRoundRef = useRef<number | null>(null);

  // Ctrl+C and Escape handling
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      abortRef.current?.abort();
      closeDb();
      exit();
    }
    if (key.escape && state === "running") {
      abortRef.current?.abort();
      abortRef.current = null;

      // Remove the user prompt and any partial results from DB and state
      if (runningRoundRef.current !== null) {
        deleteMessagesFromRound(sessionId, runningRoundRef.current);
        const fromRound = runningRoundRef.current;
        setMessages((prev) => prev.filter((m) => m.round < fromRound));
        runningRoundRef.current = null;
      }

      setThinkingAgents([]);
      setDiscussionRound(0);
      setStatusMessage("Interrupted.");
      setState("input");
    }
  });

  // Run agents, save results, return new messages
  const runAgents = async (
    currentMessages: Message[],
    round: number,
    target: Target,
    promptOverride?: string,
    isDebate = false,
  ): Promise<Message[]> => {
    // Determine which agents to run
    const activeAgents: AgentName[] = Array.isArray(target)
      ? target
      : target === "both"
        ? [...pair]
        : [target];
    setThinkingAgents(activeAgents);

    const history = formatConversationHistory(
      currentMessages.map((m) => ({
        role: m.role,
        agent: isValidAgentName(m.role) ? m.role : undefined,
        content: m.content,
      }))
    );

    const cwd = process.cwd();
    const isFirstRound = round === 0 && !existingSessionId;

    const userPrompt = currentMessages[currentMessages.length - 1]?.content || "";
    const isSingleAgent = !Array.isArray(target) && target !== "both";
    // Use the ad-hoc pair for prompt context, or fall back to the configured pair
    const promptPair: [AgentName, AgentName] = Array.isArray(target) ? target : pair;

    const agentPrompt = (_agent: AgentName) => {
      if (promptOverride) return promptOverride;
      if (isSingleAgent) return userPrompt;
      if (isFirstRound) return userPrompt;
      return "Provide your response for this round.";
    };

    const agentSystemPrompt = (agent: AgentName) => {
      if (isSingleAgent) {
        return history ? directPrompt(history) : undefined;
      }
      if (isDebate) {
        if (isFirstRound) return debatePrompt(agent, promptPair);
        return debateRoundPrompt(agent, history, promptPair);
      }
      if (isFirstRound) return collaborationPrompt(agent, promptPair);
      return discussionPrompt(agent, history, promptPair);
    };

    const ac = new AbortController();
    abortRef.current = ac;

    const results: Array<{ agent: AgentName; result: PromiseSettledResult<AgentResponse> }> = [];
    const promises: Array<Promise<void>> = [];

    for (const agent of activeAgents) {
      const descriptor = getAgent(agent);
      promises.push(
        descriptor.run({
          prompt: agentPrompt(agent),
          systemPrompt: agentSystemPrompt(agent),
          model: agentModels[agent],
          cwd,
          signal: ac.signal,
        }).then(
          (value) => { results.push({ agent, result: { status: "fulfilled", value } }); },
          (reason) => { results.push({ agent, result: { status: "rejected", reason } }); }
        )
      );
    }

    await Promise.all(promises);
    abortRef.current = null;

    // If aborted, bail out — the Escape handler already reset UI state
    if (ac.signal.aborted) return [];

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
      return runDiscussion(prompt, Array.isArray(target) ? target : undefined);
    }

    const currentRound = roundNum;
    runningRoundRef.current = currentRound;

    // Ensure session row exists and set title on first prompt
    ensureSession(sessionId);
    if (currentRound === 0) {
      const title = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      updateSessionTitle(sessionId, title);
    }

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

    // If aborted, the Escape handler already cleaned up
    if (newMessages.length === 0) return;

    setMessages((prev) => [...prev, ...newMessages]);
    setRoundNum(currentRound + 1);
    runningRoundRef.current = null;

    touchSession(sessionId);
    setState("input");
  };

  const runDiscussion = async (prompt: string, adHocPair?: [AgentName, AgentName]) => {
    const discussionTarget: Target = adHocPair ?? "both";
    setConsensusReached(false);
    let currentRound = roundNum;
    runningRoundRef.current = currentRound;

    // Ensure session row exists and set title on first prompt
    ensureSession(sessionId);
    if (currentRound === 0) {
      const title = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      updateSessionTitle(sessionId, title);
    }

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

    for (let disc = 1; disc <= config.discussion.max_rounds; disc++) {
      setDiscussionRound(disc);

      const newMessages = await runAgents(
        allMessages,
        currentRound,
        discussionTarget,
        disc === 1 ? prompt : "Provide your response for this round.",
        true,
      );

      // If aborted, stop the discussion loop
      if (newMessages.length === 0) break;

      setMessages((prev) => [...prev, ...newMessages]);
      allMessages = [...allMessages, ...newMessages];
      currentRound++;

      // Check for consensus — both active agents must include the marker
      const activePair = adHocPair ?? pair;
      const consensusFlags = activePair.map((agent) => {
        const msg = newMessages.find((m) => m.role === agent && !m.error);
        return msg?.content.includes(CONSENSUS_MARKER) ?? false;
      });

      if (consensusFlags.every(Boolean)) {
        setConsensusReached(true);
        break;
      }
    }

    setRoundNum(currentRound);
    setDiscussionRound(0);
    runningRoundRef.current = null;
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

    if (value === "/help") {
      setStatusMessage(
        [
          "/help    Show this help",
          "/config  Edit configuration",
          "/new     Start a new session",
          "/copy    Copy conversation to clipboard",
          "/exit    Exit the app",
          "",
          "Esc      Interrupt running agents",
        ].join("\n")
      );
      return;
    }

    if (value === "/config") {
      setState("config");
      return;
    }

    if (value === "/new") {
      const newId = nanoid(12);
      sessionCreatedRef.current = false;
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

      {messages.length === 0 && state === "input" && <QuickHelp />}

      {messages.map((msg, i) => {
        if (msg.role === "user") {
          return <UserMessage key={i} content={msg.content} />;
        }
        if (isValidAgentName(msg.role)) {
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
        <DiscussionStatus round={discussionRound} maxRounds={config.discussion.max_rounds} />
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

      {state === "config" && (
        <InlineConfigEditor
          isActive={state === "config"}
          onClose={() => {
            const updated = loadConfig();
            setConfig(updated);
            try {
              setPair(validateAgentPair(updated.agents));
            } catch {
              // keep current pair if new config is invalid
            }
            setAgentModels((prev) => ({
              ...prev,
              claude: updated.claude.model,
              codex: updated.codex.model,
              gemini: updated.gemini.model,
            }));
            setState("input");
          }}
        />
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
    role: m.role,
    content: m.content,
    round: m.round,
  }));
  return formatAsMarkdown(messages);
}

export function showTranscript(sessionId: string): void {
  const dbMessages = getMessages(sessionId);
  const messages: Message[] = dbMessages.map((m) => ({
    role: m.role,
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
        if (isValidAgentName(msg.role)) {
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
