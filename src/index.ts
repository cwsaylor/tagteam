import { Command } from "commander";
import { execSync } from "node:child_process";
import chalk from "chalk";
import { loadConfig, setConfigValue } from "./config.js";
import { startApp, showTranscript, showTranscriptMarkdown, showSessionList } from "./ui.js";
import { startConfigEditor } from "./config-editor.js";
import type { AgentName } from "./agents/types.js";
import { getAgent, validateAgentPair } from "./agents/registry.js";
import {
  getMostRecentSession,
  getSession,
  getSessionByPrefix,
  listSessions,
} from "./db/sessions.js";
import { getMessages } from "./db/messages.js";
import { closeDb } from "./db/index.js";

process.on("SIGTERM", () => { closeDb(); process.exit(0); });
process.on("SIGINT", () => { closeDb(); process.exit(0); });

function checkCli(name: string, installUrl: string): boolean {
  try {
    execSync(`${name} --version`, { stdio: "ignore" });
    return true;
  } catch {
    console.error(
      chalk.red(`"${name}" not found. Install it from: ${installUrl}`)
    );
    return false;
  }
}

function preflight(pair: [AgentName, AgentName]): void {
  let allFound = true;
  for (const agent of pair) {
    const descriptor = getAgent(agent);
    if (!checkCli(descriptor.cliBinary, descriptor.installUrl)) {
      allFound = false;
    }
  }
  if (!allFound) {
    process.exit(1);
  }
}

function resolveAgentPair(opts: any, config: ReturnType<typeof loadConfig>): [AgentName, AgentName] {
  if (opts.agents) {
    const names = opts.agents.split(",").map((s: string) => s.trim());
    return validateAgentPair(names);
  }
  return validateAgentPair(config.agents);
}

function resolveAgentModels(
  pair: [AgentName, AgentName],
  opts: any,
  config: ReturnType<typeof loadConfig>
): Record<AgentName, string> {
  return {
    claude: opts.claudeModel ?? config.claude.model,
    codex: opts.codexModel ?? config.codex.model,
    gemini: opts.geminiModel ?? config.gemini.model,
  };
}

const program = new Command();

program
  .name("tagteam")
  .description("Tag Team - Orchestrate AI agents collaboratively")
  .version("0.2.0")
  .option("--agents <pair>", "Agent pair to use (comma-separated, e.g. claude,gemini)")
  .option("--claude-model <model>", "Claude model to use")
  .option("--codex-model <model>", "Codex model to use")
  .option("--gemini-model <model>", "Gemini model to use")
  .argument("[prompt...]", "Prompt to send to both agents")
  .action(async (promptParts: string[], opts) => {
    const config = loadConfig();
    const pair = resolveAgentPair(opts, config);
    preflight(pair);
    const prompt = promptParts.join(" ") || undefined;

    const instance = startApp({
      initialPrompt: prompt,
      agents: pair,
      agentModels: resolveAgentModels(pair, opts, config),
      config,
    });

    await instance.waitUntilExit();
  });

// Discuss - auto-loop until consensus
program
  .command("discuss")
  .description("Have agents discuss a topic until they reach consensus")
  .argument("<prompt...>", "Topic to discuss")
  .action(async (promptParts: string[]) => {
    const config = loadConfig();
    const parentOpts = program.opts();
    const pair = resolveAgentPair(parentOpts, config);
    preflight(pair);
    const prompt = promptParts.join(" ");

    const instance = startApp({
      initialPrompt: prompt,
      agents: pair,
      agentModels: resolveAgentModels(pair, parentOpts, config),
      config,
      discuss: true,
    });

    await instance.waitUntilExit();
  });

// Continue most recent session
program
  .command("continue")
  .description("Resume the most recent session")
  .action(async () => {
    const config = loadConfig();
    const parentOpts = program.opts();
    const pair = resolveAgentPair(parentOpts, config);
    preflight(pair);
    const session = getMostRecentSession();

    if (!session) {
      console.log(chalk.red(" No active sessions found."));
      process.exit(1);
    }

    const dbMessages = getMessages(session.id);
    const transcript = dbMessages.map((m) => ({
      role: m.role,
      content: m.content,
      round: m.round,
    }));

    const instance = startApp({
      sessionId: session.id,
      agents: pair,
      agentModels: resolveAgentModels(pair, parentOpts, config),
      config,
      showTranscript: transcript,
    });

    await instance.waitUntilExit();
  });

// Resume a specific session
program
  .command("resume [id]")
  .description("Resume a session by ID, or pick interactively")
  .action(async (id: string | undefined) => {
    const config = loadConfig();
    const parentOpts = program.opts();
    const pair = resolveAgentPair(parentOpts, config);
    preflight(pair);

    if (!id) {
      const sessions = listSessions(20);
      if (sessions.length === 0) {
        console.log(chalk.red(" No sessions found."));
        process.exit(1);
      }

      console.log(chalk.bold("\n Recent sessions:\n"));
      sessions.forEach((s, i) => {
        const sid = chalk.cyan(s.id.slice(0, 7));
        const title = s.title || chalk.dim("(untitled)");
        const date = chalk.dim(s.updated_at);
        console.log(` ${chalk.dim(`${i + 1}.`)} ${sid}  ${title}  ${date}`);
      });
      console.log();

      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise<void>((resolve) => {
        rl.question(" Select session number: ", async (input) => {
          rl.close();
          const num = parseInt(input.trim(), 10);
          if (isNaN(num) || num < 1 || num > sessions.length) {
            console.log(chalk.red(" Invalid selection."));
            closeDb();
            resolve();
            return;
          }

          const session = sessions[num - 1];
          const dbMessages = getMessages(session.id);
          const transcript = dbMessages.map((m) => ({
            role: m.role,
            content: m.content,
            round: m.round,
          }));

          const instance = startApp({
            sessionId: session.id,
            agents: pair,
            agentModels: resolveAgentModels(pair, parentOpts, config),
            config,
            showTranscript: transcript,
          });

          await instance.waitUntilExit();
          resolve();
        });
      });
    }

    const session = getSession(id) || getSessionByPrefix(id);
    if (!session) {
      console.log(chalk.red(` Session not found: ${id}`));
      process.exit(1);
    }

    const dbMessages = getMessages(session.id);
    const transcript = dbMessages.map((m) => ({
      role: m.role,
      content: m.content,
      round: m.round,
    }));

    const instance = startApp({
      sessionId: session.id,
      agents: pair,
      agentModels: resolveAgentModels(pair, parentOpts, config),
      config,
      showTranscript: transcript,
    });

    await instance.waitUntilExit();
  });

// History
program
  .command("history")
  .description("List recent sessions")
  .option("-n, --limit <n>", "Number of sessions to show", parseInt, 20)
  .action((opts) => {
    const sessions = listSessions(opts.limit);
    console.log(chalk.bold("\n Recent sessions:\n"));
    showSessionList(sessions);
    console.log();
    closeDb();
  });

// Show transcript
program
  .command("show <id>")
  .description("Print full transcript for a session")
  .option("-m, --markdown", "Output as GitHub-compatible markdown")
  .action((id: string, opts: { markdown?: boolean }) => {
    const session = getSession(id) || getSessionByPrefix(id);
    if (!session) {
      console.log(chalk.red(` Session not found: ${id}`));
      process.exit(1);
    }

    if (opts.markdown) {
      process.stdout.write(showTranscriptMarkdown(session.id));
    } else {
      showTranscript(session.id);
    }
    closeDb();
  });

// Config commands
const configCmd = program
  .command("config")
  .description("Manage configuration")
  .action(async () => {
    const instance = startConfigEditor();
    await instance.waitUntilExit();
  });

configCmd
  .command("edit")
  .description("Interactively edit configuration")
  .action(async () => {
    const instance = startConfigEditor();
    await instance.waitUntilExit();
  });

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold("\n Configuration:\n"));
    console.log(
      chalk.dim(" agents           = ") + chalk.white(config.agents.join(", "))
    );
    console.log(
      chalk.dim(" claude.model     = ") + chalk.white(config.claude.model)
    );
    console.log(
      chalk.dim(" codex.model      = ") + chalk.white(config.codex.model)
    );
    console.log(
      chalk.dim(" gemini.model     = ") + chalk.white(config.gemini.model)
    );
    console.log(
      chalk.dim(" discussion.max_rounds = ") + chalk.white(String(config.discussion.max_rounds))
    );
    console.log();
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    try {
      setConfigValue(key, value);
      console.log(chalk.green(` Set ${key} = ${value}`));
    } catch (e: any) {
      console.log(chalk.red(` ${e.message}`));
      process.exit(1);
    }
  });

program.parseAsync();
