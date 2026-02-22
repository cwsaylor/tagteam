import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "smol-toml";

export interface TagTeamConfig {
  agents: [string, string];
  claude: {
    model: string;
  };
  codex: {
    model: string;
  };
  gemini: {
    model: string;
  };
  discussion: {
    max_rounds: number;
  };
}

const DEFAULT_CONFIG: TagTeamConfig = {
  agents: ["claude", "codex"],
  claude: {
    model: "sonnet",
  },
  codex: {
    model: "gpt-5.3-codex",
  },
  gemini: {
    model: "gemini-2.5-pro",
  },
  discussion: {
    max_rounds: 10,
  },
};

export function getConfigDir(): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      "tagteam"
    );
  }
  return join(homedir(), ".tagteam");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.toml");
}

export function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): TagTeamConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw) as any;
    return {
      agents: Array.isArray(parsed.agents) && parsed.agents.length === 2
        ? parsed.agents as [string, string]
        : [...DEFAULT_CONFIG.agents],
      claude: { ...DEFAULT_CONFIG.claude, ...parsed.claude },
      codex: { ...DEFAULT_CONFIG.codex, ...parsed.codex },
      gemini: { ...DEFAULT_CONFIG.gemini, ...parsed.gemini },
      discussion: { ...DEFAULT_CONFIG.discussion, ...parsed.discussion },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: TagTeamConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  writeFileSync(configPath, stringify(config as any), "utf-8");
}

export function setConfigValue(
  key: string,
  value: string
): TagTeamConfig {
  const config = loadConfig();
  const parts = key.split(".");

  if (parts.length === 1) {
    switch (parts[0]) {
      case "agents":
        config.agents = value.split(",").map((s) => s.trim()) as [string, string];
        break;
      case "claude_model":
        config.claude.model = value;
        break;
      case "codex_model":
        config.codex.model = value;
        break;
      case "gemini_model":
        config.gemini.model = value;
        break;
      case "discussion_max_rounds":
        config.discussion.max_rounds = Number(value);
        break;
      default:
        throw new Error(`Unknown config key: ${key}`);
    }
  } else if (parts.length === 2) {
    const [section, field] = parts;
    if (section === "claude" && field === "model") {
      config.claude.model = value;
    } else if (section === "codex" && field === "model") {
      config.codex.model = value;
    } else if (section === "gemini" && field === "model") {
      config.gemini.model = value;
    } else if (section === "discussion" && field === "max_rounds") {
      config.discussion.max_rounds = Number(value);
    } else {
      throw new Error(`Unknown config key: ${key}`);
    }
  } else {
    throw new Error(`Invalid config key format: ${key}`);
  }

  saveConfig(config);
  return config;
}
