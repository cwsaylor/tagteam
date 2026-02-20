import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentEvent, AgentOptions, AgentResponse } from "./types.js";

/**
 * Parse Claude Code's stream-json JSONL output into AgentEvents.
 *
 * Event format (one JSON object per line):
 *   { type: "system", subtype: "init", ... }
 *   { type: "assistant", message: { content: [{ type: "text", text }, { type: "tool_use", ... }] } }
 *   { type: "user", message: { content: [{ type: "tool_result", ... }] } }
 *   { type: "result", subtype: "success", result: "final text", ... }
 */

export async function* streamClaude(
  options: AgentOptions
): AsyncGenerator<AgentEvent> {
  const args = [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--no-session-persistence",
  ];

  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }
  if (options.model) {
    args.push("--model", options.model);
  }

  args.push(options.prompt);

  const proc = spawn("claude", args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, CLAUDECODE: "" },
  });

  // Handle spawn errors (e.g., command not found)
  let spawnErrorMsg = "";
  proc.on("error", (err) => {
    spawnErrorMsg = err.message;
  });

  const rl = createInterface({ input: proc.stdout! });
  let gotResultText = false;

  for await (const line of rl) {
    if (!line.trim()) continue;

    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    if (data.type === "assistant" && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === "text" && block.text) {
          yield { type: "text", agent: "claude", content: block.text };
          gotResultText = true;
        } else if (block.type === "tool_use") {
          yield {
            type: "tool_call",
            agent: "claude",
            toolName: block.name,
            toolInput:
              typeof block.input === "string"
                ? block.input
                : JSON.stringify(block.input),
          };
        }
      }
    } else if (data.type === "user" && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === "tool_result") {
          const text =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text)
                    .join("\n")
                : "";
          if (text) {
            yield {
              type: "tool_result",
              agent: "claude",
              toolOutput: text,
            };
          }
        }
      }
    } else if (data.type === "result") {
      if (data.is_error) {
        yield {
          type: "error",
          agent: "claude",
          content: data.error || data.result || "Unknown error",
        };
      } else if (data.result && !gotResultText) {
        // Use result.result as fallback if no assistant text blocks were emitted
        yield { type: "text", agent: "claude", content: data.result };
      }
    }
  }

  // Wait for the process to exit
  await new Promise<void>((resolve) => {
    proc.on("close", resolve);
  });

  if (spawnErrorMsg) {
    yield {
      type: "error",
      agent: "claude",
      content: `Failed to spawn claude: ${spawnErrorMsg}`,
    };
  }

  yield { type: "done", agent: "claude" };
}

export async function runClaude(options: AgentOptions): Promise<AgentResponse> {
  const start = Date.now();
  const events: AgentEvent[] = [];
  const textParts: string[] = [];
  const errors: string[] = [];

  for await (const event of streamClaude(options)) {
    events.push(event);
    if (event.type === "text" && event.content) {
      textParts.push(event.content);
    } else if (event.type === "error" && event.content) {
      errors.push(event.content);
    }
  }

  return {
    agent: "claude",
    text: textParts.join(""),
    events,
    durationMs: Date.now() - start,
    error: errors.length > 0 ? errors.join("\n") : undefined,
  };
}
