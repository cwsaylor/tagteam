import { nanoid } from "nanoid";
import { runClaude } from "./agents/claude.js";
import { runCodex } from "./agents/codex.js";
import type { AgentName } from "./agents/types.js";
import { createSession, touchSession, updateSessionTitle } from "./db/sessions.js";
import { insertMessage, getMessages } from "./db/messages.js";
import {
  collaborationPrompt,
  discussionPrompt,
  formatConversationHistory,
} from "./prompts.js";
import {
  renderHeader,
  renderUserPrompt,
  renderRoundHeader,
  renderAgentResponse,
  renderError,
  renderFooter,
  createSpinner,
} from "./ui.js";
import { closeDb } from "./db/index.js";
import type { WonderTwinsConfig } from "./config.js";

export interface OrchestratorOptions {
  prompt: string;
  sessionId?: string;
  maxRounds?: number;
  claudeModel?: string;
  codexModel?: string;
  config: WonderTwinsConfig;
}

export async function orchestrate(options: OrchestratorOptions): Promise<string> {
  const maxRounds = options.maxRounds ?? options.config.general.max_rounds;
  const claudeModel = options.claudeModel ?? options.config.claude.model;
  const codexModel = options.codexModel ?? options.config.codex.model;
  const cwd = process.cwd();

  // Create or resume session
  const sessionId = options.sessionId ?? nanoid(12);
  const isResume = !!options.sessionId;

  if (!isResume) {
    createSession(sessionId, cwd, maxRounds);
  }

  renderHeader(sessionId);

  // Get existing messages for resume
  const existingMessages = isResume ? getMessages(sessionId) : [];

  // Determine current round number
  const lastRound =
    existingMessages.length > 0
      ? Math.max(...existingMessages.map((m) => m.round))
      : -1;
  const currentRound = lastRound + 1;

  // Save user message
  insertMessage({
    sessionId,
    role: "user",
    content: options.prompt,
    round: currentRound,
  });

  renderUserPrompt(options.prompt);

  // Build conversation history from existing messages
  const conversationLog: Array<{
    role: string;
    agent?: AgentName;
    content: string;
    round: number;
  }> = existingMessages.map((m) => ({
    role: m.role,
    agent: m.role === "claude" || m.role === "codex" ? (m.role as AgentName) : undefined,
    content: m.content,
    round: m.round,
  }));

  // Add current user message
  conversationLog.push({
    role: "user",
    content: options.prompt,
    round: currentRound,
  });

  // Run rounds
  for (let round = 0; round < maxRounds; round++) {
    const roundNum = currentRound + round;
    renderRoundHeader(round, maxRounds);

    // Build the prompt for this round
    let claudePrompt: string;
    let codexPrompt: string;
    let claudeSystemPrompt: string;
    let codexSystemPrompt: string;

    if (round === 0 && !isResume) {
      // First round, no history: just the user prompt with collaboration context
      claudePrompt = options.prompt;
      codexPrompt = options.prompt;
      claudeSystemPrompt = collaborationPrompt("claude");
      codexSystemPrompt = collaborationPrompt("codex");
    } else {
      // Discussion round or resume: include full history
      const history = formatConversationHistory(conversationLog);
      claudeSystemPrompt = discussionPrompt("claude", history);
      codexSystemPrompt = discussionPrompt("codex", history);
      claudePrompt = "Provide your response for this round.";
      codexPrompt = "Provide your response for this round.";
    }

    // Run both agents in parallel
    const claudeSpinner = createSpinner("claude");
    const codexSpinner = createSpinner("codex");

    claudeSpinner.start();
    codexSpinner.start();

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

    claudeSpinner.stop();
    codexSpinner.stop();

    // Process Claude response
    if (claudeResult.status === "fulfilled") {
      const resp = claudeResult.value;
      if (resp.error) {
        renderError("claude", resp.error);
      } else {
        renderAgentResponse("claude", resp.text);
      }
      const content = resp.error || resp.text;
      insertMessage({
        sessionId,
        role: "claude",
        content,
        round: roundNum,
        durationMs: resp.durationMs,
      });
      conversationLog.push({
        role: "claude",
        agent: "claude",
        content,
        round: roundNum,
      });
    } else {
      const errorMsg = claudeResult.reason?.message || "Failed to run";
      renderError("claude", errorMsg);
      insertMessage({
        sessionId,
        role: "claude",
        content: `[Error: ${errorMsg}]`,
        round: roundNum,
      });
    }

    // Process Codex response
    if (codexResult.status === "fulfilled") {
      const resp = codexResult.value;
      if (resp.error) {
        renderError("codex", resp.error);
      } else {
        renderAgentResponse("codex", resp.text);
      }
      const content = resp.error || resp.text;
      insertMessage({
        sessionId,
        role: "codex",
        content,
        round: roundNum,
        durationMs: resp.durationMs,
      });
      conversationLog.push({
        role: "codex",
        agent: "codex",
        content,
        round: roundNum,
      });
    } else {
      const errorMsg = codexResult.reason?.message || "Failed to run";
      renderError("codex", errorMsg);
      insertMessage({
        sessionId,
        role: "codex",
        content: `[Error: ${errorMsg}]`,
        round: roundNum,
      });
    }
  }

  // Generate title from the first prompt if this is a new session
  if (!isResume) {
    const title =
      options.prompt.length > 60
        ? options.prompt.slice(0, 57) + "..."
        : options.prompt;
    updateSessionTitle(sessionId, title);
  }

  touchSession(sessionId);
  renderFooter();

  return sessionId;
}

export async function orchestrateInteractive(
  options: OrchestratorOptions
): Promise<void> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Run the first prompt
  const sessionId = await orchestrate(options);

  // Interactive loop
  const askForInput = (): void => {
    rl.question(" > ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "exit" || trimmed === "quit") {
        rl.close();
        closeDb();
        return;
      }

      await orchestrate({
        ...options,
        prompt: trimmed,
        sessionId,
      });

      askForInput();
    });
  };

  askForInput();
}
