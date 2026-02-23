export type AgentName = "claude" | "codex" | "gemini";

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

export interface AgentProfile {
  strength: string;
  role: string;
  focus: string[];
}

export interface AgentDescriptor {
  name: AgentName;
  displayName: string;
  color: string;
  cliBinary: string;
  installUrl: string;
  org: string;
  profile: AgentProfile;
  run: (options: AgentOptions) => Promise<AgentResponse>;
}
