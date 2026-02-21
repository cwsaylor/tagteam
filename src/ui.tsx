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
import { createSession, touchSession, updateSessionTitle } from "./db/sessions.js";
import { insertMessage, getMessages } from "./db/messages.js";
import { closeDb } from "./db/index.js";
import {
  collaborationPrompt,
  discussionPrompt,
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
}

type AppState = "input" | "running" | "done";

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
  claudeModel,
  codexModel,
  showTranscript,
}: AppProps) {
  const { exit } = useApp();
  const [sessionId] = useState(() => existingSessionId ?? nanoid(12));
  const [messages, setMessages] = useState<Message[]>(showTranscript ?? []);
  const [state, setState] = useState<AppState>(
    initialPrompt ? "running" : "input"
  );
  const [isThinking, setIsThinking] = useState(false);
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
      runRound(initialPrompt);
    }
  }, []);

  // Ctrl+C handling
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      closeDb();
      exit();
    }
  });

  const runRound = async (prompt: string) => {
    const currentRound = roundNum;

    // Add user message
    const userMsg: Message = {
      role: "user",
      content: prompt,
      round: currentRound,
    };
    setMessages((prev) => [...prev, userMsg]);
    insertMessage({
      sessionId,
      role: "user",
      content: prompt,
      round: currentRound,
    });

    setIsThinking(true);

    // Build prompts for agents
    const allMessages = [...messages, userMsg];
    let claudePrompt: string;
    let codexPrompt: string;
    let claudeSystemPrompt: string;
    let codexSystemPrompt: string;

    if (currentRound === 0 && !existingSessionId) {
      claudePrompt = prompt;
      codexPrompt = prompt;
      claudeSystemPrompt = collaborationPrompt("claude");
      codexSystemPrompt = collaborationPrompt("codex");
    } else {
      const history = formatConversationHistory(
        allMessages.map((m) => ({
          role: m.role,
          agent:
            m.role === "claude" || m.role === "codex"
              ? (m.role as AgentName)
              : undefined,
          content: m.content,
        }))
      );
      claudeSystemPrompt = discussionPrompt("claude", history);
      codexSystemPrompt = discussionPrompt("codex", history);
      claudePrompt = "Provide your response for this round.";
      codexPrompt = "Provide your response for this round.";
    }

    const cwd = process.cwd();

    // Run both agents in parallel
    const [claudeResult, codexResult] = await Promise.allSettled([
      runClaude({
        prompt: claudePrompt,
        systemPrompt: claudeSystemPrompt,
        model: claudeModel,
        cwd,
      }),
      runCodex({
        prompt: codexPrompt,
        systemPrompt: codexSystemPrompt,
        model: codexModel,
        cwd,
      }),
    ]);

    setIsThinking(false);

    const newMessages: Message[] = [];

    // Process Claude
    if (claudeResult.status === "fulfilled") {
      const resp = claudeResult.value;
      const msg: Message = {
        role: "claude",
        content: resp.error || resp.text,
        round: currentRound,
        error: !!resp.error,
      };
      newMessages.push(msg);
      insertMessage({
        sessionId,
        role: "claude",
        content: resp.error || resp.text,
        round: currentRound,
        durationMs: resp.durationMs,
      });
    } else {
      const errorMsg = claudeResult.reason?.message || "Failed to run";
      const msg: Message = {
        role: "claude",
        content: errorMsg,
        round: currentRound,
        error: true,
      };
      newMessages.push(msg);
      insertMessage({
        sessionId,
        role: "claude",
        content: `[Error: ${errorMsg}]`,
        round: currentRound,
      });
    }

    // Process Codex
    if (codexResult.status === "fulfilled") {
      const resp = codexResult.value;
      const msg: Message = {
        role: "codex",
        content: resp.error || resp.text,
        round: currentRound,
        error: !!resp.error,
      };
      newMessages.push(msg);
      insertMessage({
        sessionId,
        role: "codex",
        content: resp.error || resp.text,
        round: currentRound,
        durationMs: resp.durationMs,
      });
    } else {
      const errorMsg = codexResult.reason?.message || "Failed to run";
      const msg: Message = {
        role: "codex",
        content: errorMsg,
        round: currentRound,
        error: true,
      };
      newMessages.push(msg);
      insertMessage({
        sessionId,
        role: "codex",
        content: `[Error: ${errorMsg}]`,
        round: currentRound,
      });
    }

    setMessages((prev) => [...prev, ...newMessages]);
    setRoundNum(currentRound + 1);

    // Set title on first round
    if (currentRound === 0 && !existingSessionId) {
      const title =
        prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
      updateSessionTitle(sessionId, title);
    }

    touchSession(sessionId);
    setState("input");
  };

  const handleSubmit = (value: string) => {
    if (value === "/exit") {
      closeDb();
      exit();
      return;
    }
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

      {isThinking && (
        <Box flexDirection="column" marginBottom={1}>
          <ThinkingIndicator agent="claude" />
          <ThinkingIndicator agent="codex" />
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
