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
      strength: "architecture-implementation",
      role: "The Builder",
      focus: [
        "multi-file coherence and refactoring",
        "production-quality implementation",
        "design patterns and maintainability",
        "comprehensive working solutions",
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
      strength: "correctness-verification",
      role: "The Verifier",
      focus: [
        "algorithmic correctness and edge cases",
        "test coverage and failure modes",
        "standards compliance and best practices",
        "performance characteristics and benchmarks",
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
        "broad codebase context and upstream/downstream effects",
        "current ecosystem conventions and documentation",
        "architectural fit and scope assessment",
        "planning, decomposition, and tradeoff analysis",
      ],
    },
    run: runGemini,
  },
};

// Anonymized peer role descriptions keyed by sorted pair string
const PEER_ROLES: Record<string, Record<AgentName, string>> = {
  "claude,codex": {
    claude: "Correctness & Standards — they verify edge cases, test coverage, and standards compliance",
    codex: "Architecture & Implementation — they propose complete solutions and assess structural coherence",
    gemini: "", // not in this pair
  },
  "claude,gemini": {
    claude: "Strategic Context — they assess broad codebase fit, ecosystem conventions, and architectural tradeoffs",
    gemini: "Architecture & Implementation — they propose complete solutions and assess structural coherence",
    codex: "", // not in this pair
  },
  "codex,gemini": {
    codex: "Strategic Context — they assess broad codebase fit, ecosystem conventions, and architectural tradeoffs",
    gemini: "Correctness & Standards — they verify edge cases, test coverage, and standards compliance",
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
