import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "smol-toml";

export interface WonderTwinsConfig {
  claude: {
    model: string;
  };
  codex: {
    model: string;
  };
}

const DEFAULT_CONFIG: WonderTwinsConfig = {
  claude: {
    model: "sonnet",
  },
  codex: {
    model: "gpt-5.3-codex",
  },
};

export function getConfigDir(): string {
  return join(homedir(), ".wondertwins");
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

export function loadConfig(): WonderTwinsConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw) as any;
    return {
      claude: { ...DEFAULT_CONFIG.claude, ...parsed.claude },
      codex: { ...DEFAULT_CONFIG.codex, ...parsed.codex },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: WonderTwinsConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  writeFileSync(configPath, stringify(config as any), "utf-8");
}

export function setConfigValue(
  key: string,
  value: string
): WonderTwinsConfig {
  const config = loadConfig();
  const parts = key.split(".");

  if (parts.length === 1) {
    switch (parts[0]) {
      case "claude_model":
        config.claude.model = value;
        break;
      case "codex_model":
        config.codex.model = value;
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
    } else {
      throw new Error(`Unknown config key: ${key}`);
    }
  } else {
    throw new Error(`Invalid config key format: ${key}`);
  }

  saveConfig(config);
  return config;
}
