import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { AgentName } from "./agents/types.js";
import { getAgent } from "./agents/registry.js";

const FAST_MODELS: Record<AgentName, string> = {
  claude: "haiku",
  gemini: "gemini-2.0-flash",
  codex: "gpt-5.3-codex",
};

export interface ExpandResult {
  original: string;
  expanded: string;
}

function gatherProjectContext(cwd: string): string {
  const parts: string[] = [];

  try {
    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const info: string[] = [];
      if (pkg.name) info.push(`name: ${pkg.name}`);
      if (pkg.description) info.push(`description: ${pkg.description}`);
      const deps = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ].slice(0, 15);
      if (deps.length > 0) info.push(`dependencies: ${deps.join(", ")}`);
      if (info.length > 0) parts.push(`Project: ${info.join("; ")}`);
    }
  } catch {}

  try {
    const readmePath = join(cwd, "README.md");
    if (existsSync(readmePath)) {
      const readme = readFileSync(readmePath, "utf-8").slice(0, 500);
      parts.push(`README excerpt:\n${readme}`);
    }
  } catch {}

  try {
    const recentFiles = execSync(
      "git diff --name-only HEAD~5 2>/dev/null || ls -t | head -20",
      { cwd, encoding: "utf-8", timeout: 3000 },
    ).trim();
    if (recentFiles) parts.push(`Recently changed files:\n${recentFiles}`);
  } catch {}

  return parts.join("\n\n");
}

const EXPANSION_SYSTEM_PROMPT = `You are a prompt expansion assistant for a multi-agent coding tool. Your job is to rewrite terse user prompts into specific, actionable versions.

Rules:
- Preserve the user's intent exactly — do not add requirements they didn't ask for
- Make implicit context explicit using the project information provided
- Keep the expanded prompt to 2-4 sentences
- Output ONLY the expanded prompt, no preamble or explanation`;

export async function expandPrompt(
  prompt: string,
  agent: AgentName,
  cwd: string,
  signal?: AbortSignal,
): Promise<ExpandResult> {
  try {
    const context = gatherProjectContext(cwd);
    const systemPrompt = context
      ? `${EXPANSION_SYSTEM_PROMPT}\n\nProject context:\n${context}`
      : EXPANSION_SYSTEM_PROMPT;

    const descriptor = getAgent(agent);
    const response = await descriptor.run({
      prompt: `Expand this prompt:\n\n${prompt}`,
      systemPrompt,
      model: FAST_MODELS[agent],
      cwd,
      signal,
    });

    const expanded = response.text?.trim();
    if (!expanded) return { original: prompt, expanded: prompt };

    return { original: prompt, expanded };
  } catch {
    return { original: prompt, expanded: prompt };
  }
}
