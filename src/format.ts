import { getAgent, isValidAgentName } from "./agents/registry.js";

interface Message {
  role: string;
  content: string;
  error?: boolean;
}

export function formatAsMarkdown(messages: Message[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      parts.push(`**You:** ${msg.content}`);
    } else if (isValidAgentName(msg.role)) {
      const name = getAgent(msg.role).displayName;
      if (msg.error) {
        parts.push(`**${name}:** *(error)*\n\n${msg.content}`);
      } else {
        parts.push(`**${name}:**\n\n${msg.content}`);
      }
    }
  }

  return parts.join("\n\n---\n\n") + "\n";
}
