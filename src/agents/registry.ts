import type { AgentDescriptor, AgentName } from "./types.js";
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
    run: runClaude,
  },
  codex: {
    name: "codex",
    displayName: "Codex",
    color: "green",
    cliBinary: "codex",
    installUrl: "https://github.com/openai/codex",
    org: "OpenAI",
    run: runCodex,
  },
  gemini: {
    name: "gemini",
    displayName: "Gemini",
    color: "blue",
    cliBinary: "gemini",
    installUrl: "https://github.com/google-gemini/gemini-cli",
    org: "Google",
    run: runGemini,
  },
};

export function getAgent(name: AgentName): AgentDescriptor {
  return AGENTS[name];
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
