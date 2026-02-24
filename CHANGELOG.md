# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.4.5] - 2026-02-24

### Added

- LLM-powered prompt expansion — terse prompts are automatically expanded into specific, actionable versions using project context before sending to agents. Disabled by default; enable with `tagteam config set expansion.enabled true`
- Expanded prompt displayed in the UI between the user message and agent responses
- Expanding spinner shown during prompt expansion, abortable with Escape
- Expansion uses a fast/cheap model (Haiku, Gemini Flash, or Codex) for low latency

## [0.4.4] - 2026-02-24

### Added

- Prompt history with up/down arrow navigation — cycle through previously submitted prompts, matching standard shell/REPL behavior

### Fixed

- Phantom cursor no longer blinks in the lower-left corner during agent runs — agent subprocess stderr is now piped instead of inherited, preventing raw writes from corrupting Ink's cursor state

## [0.4.3] - 2026-02-23

### Fixed

- `/gist` now works correctly — removed invalid `--private` flag (`gh` creates secret gists by default)
- `/gist` errors from `gh` are now surfaced to the user instead of a generic failure message

## [0.4.2] - 2026-02-23

### Added

- `/gist` command to share a conversation as a private GitHub Gist — requires the [GitHub CLI](https://cli.github.com) (`gh`) installed and authenticated

## [0.4.1] - 2026-02-23

### Fixed

- Large discussions no longer cause UI sluggishness — completed rounds commit to the terminal's native scrollback buffer via Ink's `<Static>` component
- Users can scroll back to read earlier messages (mouse wheel, Shift+PageUp) while agents are still thinking
- Markdown rendering (`marked.parse()`) is now memoized per-message, eliminating redundant parsing on every spinner tick
- `AgentResponseBlock` and `UserMessage` wrapped with `React.memo` to skip unnecessary re-renders

## [0.4.0] - 2026-02-22

### Added

- Research-backed structured discussion prompts informed by multi-agent debate literature (Du et al. ICML 2024, ReConcile ACL 2024, CONSENSAGENT ACL Findings 2025, MAD EMNLP 2024)
- Agent role differentiation — Claude (Builder), Codex (Verifier), Gemini (Strategist) with distinct focus areas and anonymized peer descriptions
- Anti-sycophancy rules requiring agents to justify position changes and introduce novel content each round
- Toulmin-structured arguments in debate mode (claim, evidence, reasoning, caveats)
- Confidence and position-change markers (CONFIDENCE: HIGH/MEDIUM/LOW, POSITION: HELD/PARTIALLY_CHANGED/CHANGED)
- Steelman injection in round 2 of discussions — agents must argue against their own position before responding
- Smart termination detecting mutual consensus, stale debates, and cyclic position-swapping
- Context summarization for rounds 3+ to keep prompts focused
- Per-message metadata storage for parsed debate markers (confidence, position, consensus signal)

### Changed

- Default `discussion.max_rounds` lowered from 10 to 5 (structured prompts reach better outcomes faster)
- Direct agent addressing now includes agent-specific focus areas in the prompt
- Discussion mode uses tiered context: full history for rounds 1-2, structured summary + latest exchange for round 3+

## [0.3.0] - 2026-02-22

### Added

- Address any agent by name (e.g. `gemini explain this`) even if it's not in the active pair, with full conversation context
- Ad-hoc agent pairs from the prompt (e.g. `gemini and codex review this`, `gemini/claude compare`) to override the configured pair for that prompt
- Ad-hoc pairs work with discussion mode in either word order (e.g. `discuss codex and gemini ...` or `codex and gemini discuss ...`)
- `tagteam history rm <id>` to delete a specific session by ID or prefix
- `tagteam history clear` to delete all sessions (with confirmation prompt)

## [0.2.0] - 2026-02-21

### Added

- Gemini CLI support as a third agent option
- Configurable agent pairs — pick any two from Claude, Codex, and Gemini
- `--agents` CLI flag to choose agent pair (e.g. `--agents claude,gemini`)
- `--gemini-model` CLI flag to override Gemini model
- `agents` config key to set default agent pair in `config.toml`
- `[gemini]` config section with `model` setting
- Agent registry for extensible agent metadata and runner lookup
- Validation for agent pairs in config editor
- Graceful shutdown signal handlers (SIGTERM/SIGINT) to ensure database cleanup
- Clipboard error handling with actionable messages when xclip/xsel is missing on Linux
- Platform notes section in README for Windows, Linux, and macOS
- Startup detection of agent CLIs with install links when missing

### Changed

- Lowered Node.js requirement from >= 22 to >= 20
- Config directory uses `%APPDATA%\tagteam` on Windows instead of `~/.tagteam`
- Preflight check now only validates CLIs for the active agent pair
- Prompts, UI, and formatting are now agent-agnostic via registry lookups
- Config editor includes agent pair and Gemini model fields
- Inline config changes (via `/config`) take effect immediately without restarting

## [0.1.0] - 2025-02-07

### Added

- Initial release
- Interactive TUI for orchestrating Claude and Codex
- Discussion mode with automatic multi-round consensus
- Session persistence with SQLite
- Session management (continue, resume, history, show)
- Markdown transcript export
- Configuration via TOML (`config show`, `config set`, interactive editor)
- Clipboard support (copy responses)
- Slash commands (`/help`, `/new`, `/config`, Escape to interrupt)
