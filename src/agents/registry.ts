import type { AgentDescriptor, AgentName, AgentProfile } from "./types.js";
import { runClaude } from "./claude.js";
import { runCodex } from "./codex.js";
import { runGemini } from "./gemini.js";

const AGENTS: Record<AgentName, AgentDescriptor> = {
  claude: {
    name: "claude",
    displayName: "Claude",
    color: "magenta",
    cliBinary: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code",
    org: "Anthropic",
    profile: {
      strength: "structure-synthesis",
      role: "The Architect",
      focus: [
        "structural coherence and organization",
        "concrete actionable proposals",
        "practical feasibility and constraints",
        "synthesizing competing requirements",
      ],
    },
    run: runClaude,
  },
  codex: {
    name: "codex",
    displayName: "Codex",
    color: "green",
    cliBinary: "codex",
    installUrl: "https://github.com/openai/codex",
    org: "OpenAI",
    profile: {
      strength: "rigor-verification",
      role: "The Critic",
      focus: [
        "logical correctness and counterexamples",
        "edge cases and failure modes",
        "evidential standards and precision of definitions",
        "identifying unsupported claims and assumptions",
      ],
    },
    run: runCodex,
  },
  gemini: {
    name: "gemini",
    displayName: "Gemini",
    color: "blue",
    cliBinary: "gemini",
    installUrl: "https://github.com/google-gemini/gemini-cli",
    org: "Google",
    profile: {
      strength: "context-strategy",
      role: "The Strategist",
      focus: [
        "broader context and upstream/downstream implications",
        "alternative framings and perspectives",
        "scope assessment and tradeoff analysis",
        "planning, decomposition, and long-term effects",
      ],
    },
    run: runGemini,
  },
};

// Anonymized peer role descriptions keyed by sorted pair string
const PEER_ROLES: Record<string, Record<AgentName, string>> = {
  "claude,codex": {
    claude: "Rigor & Verification — they stress-test logic, find counterexamples, and demand evidence",
    codex: "Structure & Synthesis — they propose coherent solutions, integrate constraints, and ensure feasibility",
    gemini: "", // not in this pair
  },
  "claude,gemini": {
    claude: "Context & Strategy — they assess broader implications, alternative framings, and upstream/downstream effects",
    gemini: "Structure & Synthesis — they propose coherent solutions, integrate constraints, and ensure feasibility",
    codex: "", // not in this pair
  },
  "codex,gemini": {
    codex: "Context & Strategy — they assess broader implications, alternative framings, and upstream/downstream effects",
    gemini: "Rigor & Verification — they stress-test logic, find counterexamples, and demand evidence",
    claude: "", // not in this pair
  },
};

export function getAgent(name: AgentName): AgentDescriptor {
  return AGENTS[name];
}

export function getAgentProfile(name: AgentName): AgentProfile {
  return AGENTS[name].profile;
}

export function getPeerRoleDescription(agent: AgentName, pair: [AgentName, AgentName]): string {
  const key = [...pair].sort().join(",");
  return PEER_ROLES[key]?.[agent] ?? "";
}

export function getAllAgentNames(): AgentName[] {
  return Object.keys(AGENTS) as AgentName[];
}

export function isValidAgentName(name: string): name is AgentName {
  return name in AGENTS;
}

export function validateAgentPair(pair: string[]): [AgentName, AgentName] {
  if (pair.length !== 2) {
    throw new Error("Agent pair must contain exactly 2 agents");
  }
  if (pair[0] === pair[1]) {
    throw new Error("Agent pair must contain 2 distinct agents");
  }
  for (const name of pair) {
    if (!isValidAgentName(name)) {
      throw new Error(`Unknown agent: "${name}". Valid agents: ${getAllAgentNames().join(", ")}`);
    }
  }
  return pair as [AgentName, AgentName];
}
