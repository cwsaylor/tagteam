import type { AgentName } from "./agents/types.js";

const OTHER: Record<AgentName, string> = {
  claude: "Codex (OpenAI)",
  codex: "Claude (Anthropic)",
};

export function collaborationPrompt(agent: AgentName): string {
  return `You are in a collaborative session with ${OTHER[agent]}. You'll both respond to the user's prompt independently, then see each other's responses. In discussion rounds: highlight where you agree, constructively address disagreements, and build on each other's ideas. Be concise - avoid repeating what was already said.`;
}

export function discussionPrompt(
  agent: AgentName,
  conversationHistory: string
): string {
  return `${collaborationPrompt(agent)}

Here is the conversation so far:

${conversationHistory}

Now provide your response for this discussion round. Build on what was said, highlight agreements, and address any disagreements constructively. Be concise.`;
}

export function formatConversationHistory(
  messages: Array<{ role: string; agent?: AgentName; content: string }>
): string {
  return messages
    .map((m) => {
      const label =
        m.role === "user"
          ? "User"
          : m.agent === "claude"
            ? "Claude"
            : "Codex";
      return `[${label}]: ${m.content}`;
    })
    .join("\n\n");
}
