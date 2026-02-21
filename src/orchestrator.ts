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
  claudeModel?: string;
  codexModel?: string;
  config: WonderTwinsConfig;
}

/** Run a single round: send prompt to both agents in parallel, display results. */
export async function orchestrate(options: OrchestratorOptions): Promise<string> {
  const claudeModel = options.claudeModel ?? options.config.claude.model;
  const codexModel = options.codexModel ?? options.config.codex.model;
  const cwd = process.cwd();

  // Create or resume session
  const sessionId = options.sessionId ?? nanoid(12);
  const isResume = !!options.sessionId;

  if (!isResume) {
    createSession(sessionId, cwd);
  }

  renderHeader(sessionId);

  // Get existing messages for resume
  const existingMessages = isResume ? getMessages(sessionId) : [];

  // Determine current round number
  const lastRound =
    existingMessages.length > 0
      ? Math.max(...existingMessages.map((m) => m.round))
      : -1;
  const roundNum = lastRound + 1;

  // Save user message
  insertMessage({
    sessionId,
    role: "user",
    content: options.prompt,
    round: roundNum,
  });

  renderUserPrompt(options.prompt);

  // Build prompt and system prompt for agents
  let claudePrompt: string;
  let codexPrompt: string;
  let claudeSystemPrompt: string;
  let codexSystemPrompt: string;

  if (!isResume && existingMessages.length === 0) {
    // First round, no history
    claudePrompt = options.prompt;
    codexPrompt = options.prompt;
    claudeSystemPrompt = collaborationPrompt("claude");
    codexSystemPrompt = collaborationPrompt("codex");
  } else {
    // Has history: build conversation log and use discussion prompt
    const conversationLog = existingMessages.map((m) => ({
      role: m.role,
      agent: m.role === "claude" || m.role === "codex" ? (m.role as AgentName) : undefined,
      content: m.content,
    }));
    conversationLog.push({ role: "user", agent: undefined, content: options.prompt });

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
    insertMessage({
      sessionId,
      role: "claude",
      content: resp.error || resp.text,
      round: roundNum,
      durationMs: resp.durationMs,
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
    insertMessage({
      sessionId,
      role: "codex",
      content: resp.error || resp.text,
      round: roundNum,
      durationMs: resp.durationMs,
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

/** Run first prompt, then loop for follow-ups until /exit. */
export async function orchestrateInteractive(
  options: OrchestratorOptions
): Promise<void> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const sessionId = await orchestrate(options);

  const askForInput = (): void => {
    rl.question(" > ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "/exit") {
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
