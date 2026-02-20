import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, setConfigValue } from "./config.js";
import { orchestrate, orchestrateInteractive } from "./orchestrator.js";
import {
  getMostRecentSession,
  getSession,
  getSessionByPrefix,
  listSessions,
} from "./db/sessions.js";
import { getMessages } from "./db/messages.js";
import { closeDb } from "./db/index.js";
import {
  renderHeader,
  renderSessionList,
  renderAgentResponse,
  renderUserPrompt,
  renderRoundHeader,
  renderFooter,
} from "./ui.js";

const program = new Command();

program
  .name("wt")
  .description("Wonder Twins - Orchestrate Claude and Codex collaboratively")
  .version("0.1.0")
  .option("--rounds <n>", "Number of rounds (initial + discussion)", parseInt)
  .option("--claude-model <model>", "Claude model to use")
  .option("--codex-model <model>", "Codex model to use")
  .argument("[prompt...]", "Prompt to send to both agents")
  .action(async (promptParts: string[], opts) => {
    const config = loadConfig();
    const prompt = promptParts.join(" ");

    if (!prompt) {
      // Interactive mode: ask for first prompt, then continue in session
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log(
        chalk.dim(
          " Wonder Twins interactive mode. Type your prompt, or \"exit\" to quit."
        )
      );

      rl.question(" > ", async (input) => {
        rl.close();
        const trimmed = input.trim();
        if (!trimmed || trimmed === "exit" || trimmed === "quit") {
          return;
        }

        await orchestrateInteractive({
          prompt: trimmed,
          maxRounds: opts.rounds,
          claudeModel: opts.claudeModel,
          codexModel: opts.codexModel,
          config,
        });
      });
      return;
    }

    await orchestrate({
      prompt,
      maxRounds: opts.rounds,
      claudeModel: opts.claudeModel,
      codexModel: opts.codexModel,
      config,
    });

    closeDb();
  });

// Continue most recent session
program
  .command("continue")
  .description("Resume the most recent session")
  .option("--rounds <n>", "Number of rounds", parseInt)
  .action(async (opts) => {
    const config = loadConfig();
    const session = getMostRecentSession();

    if (!session) {
      console.log(chalk.red(" No active sessions found."));
      process.exit(1);
    }

    console.log(
      chalk.dim(` Resuming session ${chalk.cyan(session.id.slice(0, 7))}...`)
    );

    // Show existing conversation
    printTranscript(session.id);

    // Ask for new input
    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(" > ", async (input) => {
      rl.close();
      const trimmed = input.trim();
      if (!trimmed) {
        closeDb();
        return;
      }

      await orchestrate({
        prompt: trimmed,
        sessionId: session.id,
        maxRounds: opts.rounds,
        config,
      });

      closeDb();
    });
  });

// Resume a specific session
program
  .command("resume [id]")
  .description("Resume a session by ID, or pick interactively")
  .option("--rounds <n>", "Number of rounds", parseInt)
  .action(async (id: string | undefined, opts) => {
    const config = loadConfig();

    if (!id) {
      // Interactive picker
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

      rl.question(" Select session number: ", async (input) => {
        rl.close();
        const num = parseInt(input.trim(), 10);
        if (isNaN(num) || num < 1 || num > sessions.length) {
          console.log(chalk.red(" Invalid selection."));
          closeDb();
          return;
        }

        const session = sessions[num - 1];
        printTranscript(session.id);

        const rl2 = (await import("node:readline")).createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        rl2.question(" > ", async (prompt) => {
          rl2.close();
          if (!prompt.trim()) {
            closeDb();
            return;
          }

          await orchestrate({
            prompt: prompt.trim(),
            sessionId: session.id,
            maxRounds: opts.rounds,
            config,
          });

          closeDb();
        });
      });
      return;
    }

    // Resume by ID or prefix
    const session = getSession(id) || getSessionByPrefix(id);
    if (!session) {
      console.log(chalk.red(` Session not found: ${id}`));
      process.exit(1);
    }

    printTranscript(session.id);

    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(" > ", async (input) => {
      rl.close();
      if (!input.trim()) {
        closeDb();
        return;
      }

      await orchestrate({
        prompt: input.trim(),
        sessionId: session.id,
        maxRounds: opts.rounds,
        config,
      });

      closeDb();
    });
  });

// History
program
  .command("history")
  .description("List recent sessions")
  .option("-n, --limit <n>", "Number of sessions to show", parseInt, 20)
  .action((opts) => {
    const sessions = listSessions(opts.limit);
    console.log(chalk.bold("\n Recent sessions:\n"));
    renderSessionList(sessions);
    console.log();
    closeDb();
  });

// Show transcript
program
  .command("show <id>")
  .description("Print full transcript for a session")
  .action((id: string) => {
    const session = getSession(id) || getSessionByPrefix(id);
    if (!session) {
      console.log(chalk.red(` Session not found: ${id}`));
      process.exit(1);
    }

    printTranscript(session.id);
    closeDb();
  });

// Config commands
const configCmd = program
  .command("config")
  .description("Manage configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold("\n Configuration:\n"));
    console.log(
      chalk.dim(" general.max_rounds = ") + chalk.white(config.general.max_rounds)
    );
    console.log(
      chalk.dim(" claude.model       = ") + chalk.white(config.claude.model)
    );
    console.log(
      chalk.dim(" codex.model        = ") + chalk.white(config.codex.model)
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

// Helper to print a session transcript
function printTranscript(sessionId: string): void {
  const messages = getMessages(sessionId);
  renderHeader(sessionId);

  let lastRound = -1;
  for (const msg of messages) {
    if (msg.round !== lastRound) {
      if (msg.role !== "user") {
        renderRoundHeader(msg.round, 0);
      }
      lastRound = msg.round;
    }

    if (msg.role === "user") {
      renderUserPrompt(msg.content);
    } else if (msg.role === "claude" || msg.role === "codex") {
      renderAgentResponse(msg.role, msg.content);
    }
  }

  renderFooter();
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log(chalk.dim("\n Interrupted. Session state saved."));
  closeDb();
  process.exit(0);
});

program.parse();
