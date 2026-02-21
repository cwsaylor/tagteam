import chalk from "chalk";
import ora, { type Ora } from "ora";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import type { AgentName } from "./agents/types.js";

marked.use(markedTerminal() as any);

const AGENT_COLORS: Record<AgentName, typeof chalk.blue> = {
  claude: chalk.magenta,
  codex: chalk.green,
};

const AGENT_LABELS: Record<AgentName, string> = {
  claude: "Claude",
  codex: "Codex",
};

export function renderHeader(sessionId: string): void {
  const line = chalk.dim("─".repeat(60));
  console.log();
  console.log(
    ` ${line.slice(0, 3)} ${chalk.bold("Wonder Twins")} ${chalk.dim("──")} session ${chalk.cyan(sessionId.slice(0, 7))} ${line.slice(0, 30)}`
  );
  console.log();
}

export function renderUserPrompt(prompt: string): void {
  console.log(` ${chalk.bold.white("You:")} ${prompt}`);
  console.log();
}

export function renderRoundHeader(round: number, maxRounds: number): void {
  const label =
    round === 0
      ? "Round 1"
      : `Round ${round + 1} (Discussion)`;
  const line = chalk.dim("─".repeat(55));
  console.log(` ${chalk.dim("──")} ${chalk.bold(label)} ${line}`);
  console.log();
}

export function renderAgentResponse(agent: AgentName, text: string): void {
  const color = AGENT_COLORS[agent];
  const label = AGENT_LABELS[agent];
  console.log(` ${color.bold(`${label}:`)}`);

  const rendered = marked.parse(text) as string;
  // Indent the rendered output
  const indented = rendered
    .split("\n")
    .map((line) => ` ${line}`)
    .join("\n");
  process.stdout.write(indented);
  console.log();
}

export function renderError(agent: AgentName, error: string): void {
  const label = AGENT_LABELS[agent];
  console.log(` ${chalk.red.bold(`${label} error:`)} ${chalk.red(error)}`);
  console.log();
}

export function renderFooter(): void {
  const line = chalk.dim("─".repeat(60));
  console.log(` ${line}`);
}

export function renderSessionList(
  sessions: Array<{
    id: string;
    title: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>
): void {
  if (sessions.length === 0) {
    console.log(chalk.dim(" No sessions found."));
    return;
  }

  for (const s of sessions) {
    const id = chalk.cyan(s.id.slice(0, 7));
    const title = s.title || chalk.dim("(untitled)");
    const status =
      s.status === "active" ? chalk.green("active") : chalk.dim(s.status);
    const date = chalk.dim(s.updated_at);
    console.log(` ${id}  ${title}  ${status}  ${date}`);
  }
}

export function createSpinner(agent: AgentName): Ora {
  const color = agent === "claude" ? "magenta" : "green";
  return ora({
    text: `${AGENT_LABELS[agent]} is thinking...`,
    color,
    indent: 1,
  });
}

export function renderInteractivePromptMarker(): void {
  process.stdout.write(` ${chalk.bold(">")} `);
}
