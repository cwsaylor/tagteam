# tagteam

Orchestrate AI agents in collaborative sessions. Pick any two from Claude, Codex, and Gemini — send a prompt to both simultaneously, then let them build on each other's responses in multi-round discussions.

## Install

```bash
npm install -g tagteam
```

Or run directly:

```bash
npx tagteam "your prompt here"
```

## Prerequisites

- Node.js >= 20
- At least two of the following CLIs installed and authenticated:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (Anthropic)
  - [Codex](https://github.com/openai/codex) (OpenAI)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Google)

## Usage

### Interactive mode

```bash
tagteam
```

Launches an interactive TUI where you can type prompts and see responses from both agents side by side.

### One-shot prompt

```bash
tagteam "explain how this codebase handles authentication"
```

### Choosing agents

By default, tagteam uses Claude and Codex. Use `--agents` to pick a different pair:

```bash
tagteam --agents claude,gemini "compare these approaches"
tagteam --agents codex,gemini "review this code"
```

You can also set the default pair in your config:

```toml
agents = ["claude", "gemini"]
```

### Addressing agents inline

Prefix your prompt with an agent name to send it to just that agent:

```
gemini what do you think about this approach?
claude summarize the discussion so far
```

Name two agents to override the active pair for that prompt:

```
gemini and codex review this function
gemini/claude compare your approaches
discuss codex and gemini what's the best caching strategy
```

This works for any agent, not just your active pair. Addressed agents receive the full conversation history for context.

### Discussion mode

Have your agents discuss a topic in rounds until they reach consensus:

```bash
tagteam discuss "what's the best approach for caching in this app"
```

### Session management

```bash
# Resume the most recent session
tagteam continue

# List recent sessions
tagteam history

# Resume a specific session by ID
tagteam resume <id>

# Show full transcript
tagteam show <id>

# Export transcript as markdown
tagteam show <id> --markdown
```

### Configuration

Configuration is stored in `~/.tagteam/config.toml` (or `%APPDATA%\tagteam\config.toml` on Windows).

```bash
# Interactive config editor
tagteam config

# Show current config
tagteam config show

# Set a value
tagteam config set agents claude,gemini
tagteam config set claude.model sonnet
tagteam config set codex.model gpt-5.3-codex
tagteam config set gemini.model gemini-2.5-pro
tagteam config set discussion.max_rounds 10
```

### CLI options

```bash
tagteam --agents claude,gemini   # Choose agent pair
tagteam --claude-model <model>   # Override Claude model
tagteam --codex-model <model>    # Override Codex model
tagteam --gemini-model <model>   # Override Gemini model
```

## Interactive commands

While in a session, type these slash commands:

- `/help` - List available commands
- `/new` - Start a fresh session
- `/config` - Open the config editor (changes take effect immediately)
- `/copy` - Copy conversation to clipboard
- `/exit` - Exit the app
- `Escape` - Interrupt running agents

## Platform Notes

**macOS** — Works out of the box.

**Linux** — Clipboard support requires `xclip` or `xsel`:

```bash
sudo apt install xclip   # Debian/Ubuntu
```

If `better-sqlite3` doesn't have a prebuilt binary for your architecture, you'll need build tools:

```bash
sudo apt install build-essential python3
```

**Windows** — Recommended to use [Windows Terminal](https://aka.ms/terminal) for best rendering. If `better-sqlite3` fails to install, ensure you have the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ workload) installed.

## License

MIT
