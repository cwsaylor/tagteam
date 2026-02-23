import type { AgentName } from "./agents/types.js";
import { formatConversationHistory } from "./prompts.js";

// --- Types ---

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type PositionChange = "HELD" | "PARTIALLY_CHANGED" | "CHANGED";
export type TerminationReason = "mutual-consensus" | "stale-no-progress" | "cyclic-swap" | "max-rounds";

export interface RoundAnalysis {
  agent: AgentName;
  confidence: ConfidenceLevel;
  positionChange: PositionChange;
  signaledConsensus: boolean;
  hasNovelContent: boolean;
}

export interface DiscussionState {
  round: number;
  analyses: RoundAnalysis[][];  // per discussion round
  terminated: boolean;
  terminationReason?: TerminationReason;
}

// --- Parsing ---

const CONFIDENCE_RE = /CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i;
const POSITION_RE = /POSITION:\s*(HELD|PARTIALLY_CHANGED|CHANGED)/i;
const CONSENSUS_RE = /\[CONSENSUS\]/;

export function parseRoundAnalysis(agent: AgentName, responseText: string): RoundAnalysis {
  const confidenceMatch = responseText.match(CONFIDENCE_RE);
  const positionMatch = responseText.match(POSITION_RE);
  const signaledConsensus = CONSENSUS_RE.test(responseText);

  // hasNovelContent: true if the response is substantial (more than just markers/boilerplate)
  // Strip out markers and whitespace, check if meaningful content remains
  const stripped = responseText
    .replace(CONFIDENCE_RE, "")
    .replace(POSITION_RE, "")
    .replace(CONSENSUS_RE, "")
    .trim();
  const hasNovelContent = stripped.length > 100;

  return {
    agent,
    confidence: (confidenceMatch?.[1]?.toUpperCase() as ConfidenceLevel) ?? "MEDIUM",
    positionChange: (positionMatch?.[1]?.toUpperCase() as PositionChange) ?? "HELD",
    signaledConsensus,
    hasNovelContent,
  };
}

// --- Termination detection ---

export function checkTermination(
  state: DiscussionState,
  maxRounds: number
): { terminated: boolean; reason?: TerminationReason } {
  const { round, analyses } = state;

  // 1. Mutual consensus: both agents signaled [CONSENSUS] AND both HIGH confidence
  if (analyses.length > 0) {
    const latest = analyses[analyses.length - 1];
    if (latest && latest.length >= 2) {
      const allConsensus = latest.every((a) => a.signaledConsensus);
      const allHigh = latest.every((a) => a.confidence === "HIGH");
      if (allConsensus && allHigh) {
        return { terminated: true, reason: "mutual-consensus" };
      }
    }
  }

  // 2. Stale: two consecutive rounds where both agents HELD and no novel content
  if (analyses.length >= 2) {
    const prev = analyses[analyses.length - 2];
    const curr = analyses[analyses.length - 1];
    if (prev && curr && prev.length >= 2 && curr.length >= 2) {
      const prevStale = prev.every((a) => a.positionChange === "HELD" && !a.hasNovelContent);
      const currStale = curr.every((a) => a.positionChange === "HELD" && !a.hasNovelContent);
      if (prevStale && currStale) {
        return { terminated: true, reason: "stale-no-progress" };
      }
    }
  }

  // 3. Cyclic swap: both agents CHANGED in two consecutive rounds
  if (analyses.length >= 2) {
    const prev = analyses[analyses.length - 2];
    const curr = analyses[analyses.length - 1];
    if (prev && curr && prev.length >= 2 && curr.length >= 2) {
      const prevSwap = prev.every((a) => a.positionChange === "CHANGED");
      const currSwap = curr.every((a) => a.positionChange === "CHANGED");
      if (prevSwap && currSwap) {
        return { terminated: true, reason: "cyclic-swap" };
      }
    }
  }

  // 4. Max rounds
  if (round >= maxRounds) {
    return { terminated: true, reason: "max-rounds" };
  }

  return { terminated: false };
}

// --- Termination display messages ---

export function terminationMessage(reason: TerminationReason): string {
  switch (reason) {
    case "mutual-consensus":
      return "Consensus reached.";
    case "stale-no-progress":
      return "Discussion stalled — no new arguments. Showing final positions.";
    case "cyclic-swap":
      return "Agents are trading positions. Showing both perspectives.";
    case "max-rounds":
      return "Maximum rounds reached. Showing final positions.";
  }
}

// --- Steelman injection decision ---

export function shouldInjectSteelman(state: DiscussionState): boolean {
  // Always inject steelman prompt in round 2 (after round 1 completes)
  return state.round === 1 && state.analyses.length === 1;
}

// --- Context building ---

export function buildConversationContext(
  allMessages: Array<{ role: string; agent?: AgentName; content: string }>,
  analyses: RoundAnalysis[][],
  currentRound: number,
  _pair: [AgentName, AgentName]
): string {
  // Rounds 1-2: full history
  if (currentRound <= 2) {
    return formatConversationHistory(allMessages);
  }

  // Round 3+: structured summary of earlier rounds + full text of latest round
  const summaryParts: string[] = [];

  // Summarize earlier rounds from analyses
  for (let i = 0; i < analyses.length - 1; i++) {
    const roundAnalyses = analyses[i];
    if (!roundAnalyses) continue;
    const roundSummary = roundAnalyses.map((a) => {
      return `${a.agent}: confidence=${a.confidence}, position=${a.positionChange}${a.signaledConsensus ? ", signaled consensus" : ""}`;
    }).join("; ");
    summaryParts.push(`Round ${i + 1}: ${roundSummary}`);
  }

  // Get messages from the latest round only (last 2-3 messages: possibly user + 2 agents)
  // Find the boundary: messages for the latest discussion round
  const latestMessages = allMessages.slice(-3);

  const summary = summaryParts.length > 0
    ? `Previous rounds summary:\n${summaryParts.join("\n")}\n\nLatest exchange:\n${formatConversationHistory(latestMessages)}`
    : formatConversationHistory(allMessages);

  return summary;
}

// --- Metadata conversion ---

export function analysisToMetadata(analysis: RoundAnalysis): Record<string, unknown> {
  return {
    confidence: analysis.confidence,
    positionChange: analysis.positionChange,
    signaledConsensus: analysis.signaledConsensus,
    hasNovelContent: analysis.hasNovelContent,
  };
}
