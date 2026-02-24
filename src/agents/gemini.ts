import { spawn } from "node:child_process";
import type { AgentEvent, AgentOptions, AgentResponse } from "./types.js";

/**
 * Run the Gemini CLI and parse its JSON output into AgentEvents.
 *
 * Gemini CLI returns a single JSON blob (not streaming JSONL):
 *   { response: "text", stats: {...}, error: "..." }
 *
 * No --system-prompt flag — prepend system prompt to user prompt (same as codex).
 * Flags: gemini -p "prompt" --output-format json -m model --yolo
 */

async function* streamGemini(
  options: AgentOptions
): AsyncGenerator<AgentEvent> {
  const args = ["-p"];

  // Build the full prompt with system context prepended
  let fullPrompt = options.prompt;
  if (options.systemPrompt) {
    fullPrompt = `${options.systemPrompt}\n\n---\n\n${options.prompt}`;
  }

  args.push(fullPrompt, "--output-format", "json", "--yolo");

  if (options.model) {
    args.push("-m", options.model);
  }

  const proc = spawn("gemini", args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  // Handle spawn errors (e.g., command not found)
  let spawnErrorMsg = "";
  proc.on("error", (err) => {
    spawnErrorMsg = err.message;
  });

  // Abort support — kill the child process when signalled
  if (options.signal) {
    if (options.signal.aborted) {
      proc.kill();
    } else {
      options.signal.addEventListener("abort", () => proc.kill(), { once: true });
    }
  }

  // Collect all stdout into a single buffer
  const chunks: Buffer[] = [];
  proc.stdout!.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  // Wait for the process to exit
  await new Promise<void>((resolve) => {
    proc.on("close", resolve);
  });

  if (spawnErrorMsg) {
    yield {
      type: "error",
      agent: "gemini",
      content: `Failed to spawn gemini: ${spawnErrorMsg}`,
    };
    yield { type: "done", agent: "gemini" };
    return;
  }

  const stdout = Buffer.concat(chunks).toString("utf-8").trim();

  if (!stdout) {
    yield { type: "error", agent: "gemini", content: "No output from gemini" };
    yield { type: "done", agent: "gemini" };
    return;
  }

  try {
    const data = JSON.parse(stdout);

    if (data.error) {
      yield { type: "error", agent: "gemini", content: data.error };
    } else if (data.response) {
      yield { type: "text", agent: "gemini", content: data.response };
    } else {
      yield { type: "error", agent: "gemini", content: "Unexpected response format" };
    }
  } catch {
    // If it's not JSON, treat the entire stdout as text
    yield { type: "text", agent: "gemini", content: stdout };
  }

  yield { type: "done", agent: "gemini" };
}

export async function runGemini(options: AgentOptions): Promise<AgentResponse> {
  const start = Date.now();
  const events: AgentEvent[] = [];
  const textParts: string[] = [];
  const errors: string[] = [];

  for await (const event of streamGemini(options)) {
    events.push(event);
    if (event.type === "text" && event.content) {
      textParts.push(event.content);
    } else if (event.type === "error" && event.content) {
      errors.push(event.content);
    }
  }

  return {
    agent: "gemini",
    text: textParts.join(""),
    events,
    durationMs: Date.now() - start,
    error: errors.length > 0 ? errors.join("\n") : undefined,
  };
}
