import type { AgentName } from "./agents/types.js";
import { getAgent, getAgentProfile, getPeerRoleDescription, isValidAgentName } from "./agents/registry.js";

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

// --- Base prompt: anti-sycophancy rules, applies to all modes ---

export function basePrompt(): string {
  return `You are one of two expert analysts in a structured discussion.
You will independently analyze the problem, then engage in focused rounds of
critique and refinement with your peer.

Ground rules:
- You are evaluated on the ACCURACY and QUALITY of your final position, not
  on agreement with your peer.
- When you change your position, you MUST name the specific argument that
  changed your mind and explain why your previous reasoning was flawed.
  Changing position without this justification is not acceptable.
- Each response must either: (a) introduce new evidence or a new argument,
  (b) identify a specific logical flaw or unsupported claim in your peer's
  reasoning, or (c) concede a point with explicit justification. Restating
  or paraphrasing existing points is not acceptable.
- Your peer is a different AI model with different training. Their perspective
  may reveal genuine blind spots in yours — and vice versa.`;
}

// --- Role prompt: model-specific focus + peer role description ---

const ROLE_TEMPLATES: Record<AgentName, string> = {
  claude: `Your role: Structure & Synthesis Analyst.

Focus your analysis on:
- Structural coherence — how do the parts of the proposal fit together?
- Concrete actionable proposals — not just critique, but workable solutions
- Practical feasibility — what constraints exist and how to work within them?
- Synthesizing competing requirements into a coherent recommendation

When you propose a solution, present it concretely with specifics. When you
critique, point to specific structural issues and show what the fix looks
like. Your peer's role is {peerRole} — they will stress-test your proposals
from a different angle.`,

  codex: `Your role: Rigor & Verification Analyst.

Focus your analysis on:
- Logical correctness — does the reasoning actually hold in all cases?
- Counterexamples and edge cases — what scenarios break the argument?
- Evidential standards — are claims supported by data, examples, or references?
- Precision of definitions — are key terms and assumptions clearly stated?

When you critique, provide specific counterexamples or scenarios that demonstrate
the issue. When you propose alternatives, explain the logical guarantees.
Your peer's role is {peerRole} — they will focus on different aspects of the
same problem.`,

  gemini: `Your role: Context & Strategy Analyst.

Focus your analysis on:
- Broader context — how does this fit within the larger picture?
- Alternative framings — what perspectives or approaches are being overlooked?
- Upstream and downstream effects — what will this break or enable elsewhere?
- Scope and planning — is this the right approach at the right level of
  abstraction?

When you critique, ground your position in the broader context your peer may
be missing. When you propose alternatives, explain the tradeoffs involved.
Your peer's role is {peerRole} — they will focus on different aspects of the
same problem.`,
};

export function rolePrompt(agent: AgentName, pair: [AgentName, AgentName]): string {
  const template = ROLE_TEMPLATES[agent];
  const peerRole = getPeerRoleDescription(agent, pair);
  return template.replace("{peerRole}", peerRole);
}

// --- Collaboration system prompt: normal mode, round 1 ---

export function collaborationSystemPrompt(agent: AgentName, pair: [AgentName, AgentName]): string {
  return `${basePrompt()}

${rolePrompt(agent, pair)}`;
}

// --- Discussion round prompt: normal mode, rounds 2+ ---

export function discussionRoundPrompt(
  agent: AgentName,
  conversationContext: string,
  pair: [AgentName, AgentName]
): string {
  return `${basePrompt()}

${rolePrompt(agent, pair)}

Here is the discussion so far:

${conversationContext}

For this round:
1. What is the strongest point in your peer's response?
2. What is the weakest point, or what claim lacks supporting evidence?
3. Has your position changed? State one of: HELD / PARTIALLY_CHANGED / CHANGED
   — with explicit reasoning for why.
4. If proposing a solution, present it concretely and explain tradeoffs
   versus your peer's approach.
5. Confidence in your current position: LOW | MEDIUM | HIGH

CONFIDENCE: HIGH | MEDIUM | LOW

Keep it concise. Do not restate points already established.`;
}

// --- Debate system prompt: discuss mode, round 1 ---

export function debateSystemPrompt(agent: AgentName, pair: [AgentName, AgentName]): string {
  return `${basePrompt()}

${rolePrompt(agent, pair)}

This is a structured discussion aimed at reaching a well-reasoned position
through genuine deliberation.

Additional rules for discussion mode:
- Structure your arguments: STATE your claim, provide EVIDENCE (specific examples,
  data, references), explain your REASONING connecting evidence to
  claim, and note CAVEATS (when your claim doesn't hold).
- Express confidence: end your response with CONFIDENCE: HIGH | MEDIUM | LOW
  and a one-line explanation of what would change your mind.
- Consensus signaling: when you believe you and your peer agree on all key
  points AND your confidence is HIGH, end your response with ${CONSENSUS_MARKER} on
  its own line. Only signal consensus when:
  (a) You can state the shared position in one sentence
  (b) You have HIGH confidence
  (c) You are not just deferring — you genuinely agree with the reasoning`;
}

// --- Debate round prompt: discuss mode, rounds 2+ ---

export function debateRoundPrompt(
  agent: AgentName,
  conversationContext: string,
  pair: [AgentName, AgentName]
): string {
  return `${debateSystemPrompt(agent, pair)}

${conversationContext}

For this round:
1. Address your peer's strongest argument directly — do you accept it? Why or
   why not?
2. If your peer identified a flaw in your reasoning, acknowledge it explicitly
   or defend with new evidence.
3. State your current position with EVIDENCE and REASONING.
4. CONFIDENCE: HIGH | MEDIUM | LOW — what specific evidence would change
   your remaining position?
5. If consensus: state the shared position in one sentence, then ${CONSENSUS_MARKER}.

POSITION: HELD | PARTIALLY_CHANGED | CHANGED`;
}

// --- Steelman prompt: discuss mode, round 2 ---

export function steelmanPrompt(): string {
  return `You and your peer appear to largely agree after Round 1. Before confirming
consensus, steelman the opposing view:

- What is the strongest argument AGAINST your shared position?
- What context or edge case might make a different approach better?
- Is there a tradeoff you're both overlooking?

If after considering the counterarguments you still hold your position, explain
why the counterarguments don't apply here. Then proceed with your normal round
response.

`;
}

// --- Direct prompt: single-agent address ---

export function directPrompt(agent: AgentName, conversationHistory: string): string {
  const profile = getAgentProfile(agent);
  const focusAreas = profile.focus.map((f) => `- ${f}`).join("\n");

  return `You are being addressed directly in a multi-agent session. The user wants YOUR
specific perspective.

Here is the conversation so far:
${conversationHistory}

Respond to the user's latest message. Focus on your area of expertise:
${focusAreas}

Be concise and direct.`;
}
