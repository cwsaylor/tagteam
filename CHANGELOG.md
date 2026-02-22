# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
