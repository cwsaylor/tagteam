interface Message {
  role: "user" | "claude" | "codex" | "system";
  content: string;
  error?: boolean;
}

export function formatAsMarkdown(messages: Message[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      parts.push(`**You:** ${msg.content}`);
    } else {
      const name = msg.role === "claude" ? "Claude" : "Codex";
      if (msg.error) {
        parts.push(`**${name}:** *(error)*\n\n${msg.content}`);
      } else {
        parts.push(`**${name}:**\n\n${msg.content}`);
      }
    }
  }

  return parts.join("\n\n---\n\n") + "\n";
}
