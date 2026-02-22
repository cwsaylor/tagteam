import type { AgentName } from "./agents/types.js";
import { getAgent, isValidAgentName } from "./agents/registry.js";

function otherAgent(agent: AgentName, pair: [AgentName, AgentName]): string {
  const other = pair[0] === agent ? pair[1] : pair[0];
  const desc = getAgent(other);
  return `${desc.displayName} (${desc.org})`;
}

export function collaborationPrompt(agent: AgentName, pair: [AgentName, AgentName]): string {
  return `You are in a collaborative session with ${otherAgent(agent, pair)}. You'll both respond to the user's prompt independently, then see each other's responses. In discussion rounds: highlight where you agree, constructively address disagreements, and build on each other's ideas. Be concise - avoid repeating what was already said.`;
}

export function discussionPrompt(
  agent: AgentName,
  conversationHistory: string,
  pair: [AgentName, AgentName]
): string {
  return `${collaborationPrompt(agent, pair)}

Here is the conversation so far:

${conversationHistory}

Now provide your response for this discussion round. Build on what was said, highlight agreements, and address any disagreements constructively. Be concise.`;
}

export function debatePrompt(agent: AgentName, pair: [AgentName, AgentName]): string {
  const other = otherAgent(agent, pair);
  return `You are in a structured debate with ${other}. You'll both respond to the user's prompt, then see each other's responses and discuss.

Your goal is to reach consensus through constructive discussion. In each round:
- Address specific points of agreement and disagreement
- Refine your position based on valid arguments from ${other}
- Be concise — don't repeat points already established

When you believe you and ${other} have reached substantial agreement on the key points, end your response with [CONSENSUS] on its own line. Only do this when you genuinely agree — don't force premature consensus.`;
}

export function debateRoundPrompt(
  agent: AgentName,
  conversationHistory: string,
  pair: [AgentName, AgentName]
): string {
  const other = otherAgent(agent, pair);
  return `${debatePrompt(agent, pair)}

Here is the conversation so far:

${conversationHistory}

Respond to the latest round. If you agree with ${other}'s position on all key points, end with [CONSENSUS]. Otherwise, continue the discussion.`;
}

export const CONSENSUS_MARKER = "[CONSENSUS]";

export function formatConversationHistory(
  messages: Array<{ role: string; agent?: AgentName; content: string }>
): string {
  return messages
    .map((m) => {
      let label: string;
      if (m.role === "user") {
        label = "User";
      } else if (isValidAgentName(m.role)) {
        label = getAgent(m.role).displayName;
      } else if (m.agent && isValidAgentName(m.agent)) {
        label = getAgent(m.agent).displayName;
      } else {
        label = m.role;
      }
      return `[${label}]: ${m.content}`;
    })
    .join("\n\n");
}
