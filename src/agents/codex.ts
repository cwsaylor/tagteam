import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentEvent, AgentOptions, AgentResponse } from "./types.js";

/**
 * Parse Codex CLI's exec --json JSONL output into AgentEvents.
 *
 * Event format (one JSON object per line):
 *   { type: "thread.started", thread_id: "..." }
 *   { type: "turn.started" }
 *   { type: "item.completed", item: { type: "agent_message", text: "..." } }
 *   { type: "item.started"|"item.completed", item: { type: "command_execution", command, aggregated_output, exit_code } }
 *   { type: "turn.completed", usage: { ... } }
 */

async function* streamCodex(
  options: AgentOptions
): AsyncGenerator<AgentEvent> {
  const args = ["exec", "--json", "--full-auto", "--ephemeral"];

  if (options.model) {
    args.push("-m", options.model);
  }

  // Build the full prompt with system context prepended
  let fullPrompt = options.prompt;
  if (options.systemPrompt) {
    fullPrompt = `${options.systemPrompt}\n\n---\n\n${options.prompt}`;
  }

  args.push(fullPrompt);

  const proc = spawn("codex", args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "inherit"],
    env: process.env,
  });

  // Handle spawn errors (e.g., command not found)
  let spawnErrorMsg = "";
  proc.on("error", (err) => {
    spawnErrorMsg = err.message;
  });

  const rl = createInterface({ input: proc.stdout! });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    if (data.type === "item.completed" && data.item) {
      const item = data.item;

      if (item.type === "agent_message" && item.text) {
        yield { type: "text", agent: "codex", content: item.text };
      } else if (item.type === "command_execution") {
        yield {
          type: "tool_call",
          agent: "codex",
          toolName: "command",
          toolInput: item.command,
        };
        if (item.aggregated_output) {
          yield {
            type: "tool_result",
            agent: "codex",
            toolOutput: item.aggregated_output,
          };
        }
      } else if (item.type === "file_change" && item.changes) {
        const desc = item.changes
          .map((c: any) => `${c.kind}: ${c.path}`)
          .join(", ");
        yield {
          type: "tool_result",
          agent: "codex",
          toolName: "file_change",
          toolOutput: desc,
        };
      } else if (item.type === "error") {
        yield {
          type: "error",
          agent: "codex",
          content: item.message || "Unknown error",
        };
      }
    } else if (data.type === "turn.failed") {
      yield {
        type: "error",
        agent: "codex",
        content: data.error?.message || "Turn failed",
      };
    } else if (data.type === "error") {
      yield {
        type: "error",
        agent: "codex",
        content: data.message || "Stream error",
      };
    }
  }

  // Wait for the process to exit
  await new Promise<void>((resolve) => {
    proc.on("close", resolve);
  });

  if (spawnErrorMsg) {
    yield {
      type: "error",
      agent: "codex",
      content: `Failed to spawn codex: ${spawnErrorMsg}`,
    };
  }

  yield { type: "done", agent: "codex" };
}

export async function runCodex(options: AgentOptions): Promise<AgentResponse> {
  const start = Date.now();
  const events: AgentEvent[] = [];
  const textParts: string[] = [];
  const errors: string[] = [];

  for await (const event of streamCodex(options)) {
    events.push(event);
    if (event.type === "text" && event.content) {
      textParts.push(event.content);
    } else if (event.type === "error" && event.content) {
      errors.push(event.content);
    }
  }

  return {
    agent: "codex",
    text: textParts.join(""),
    events,
    durationMs: Date.now() - start,
    error: errors.length > 0 ? errors.join("\n") : undefined,
  };
}
