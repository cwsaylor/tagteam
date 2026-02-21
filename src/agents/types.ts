export type AgentName = "claude" | "codex";

export interface AgentEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  agent: AgentName;
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
}

export interface AgentResponse {
  agent: AgentName;
  text: string;
  events: AgentEvent[];
  durationMs: number;
  error?: string;
}

export interface AgentOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  cwd?: string;
  signal?: AbortSignal;
}
