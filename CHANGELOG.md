# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Lowered Node.js requirement from >= 22 to >= 20
- Config directory uses `%APPDATA%\tagteam` on Windows instead of `~/.tagteam`

### Added

- Graceful shutdown signal handlers (SIGTERM/SIGINT) to ensure database cleanup
- Clipboard error handling with actionable messages when xclip/xsel is missing on Linux
- Platform notes section in README for Windows, Linux, and macOS
- Startup detection of `claude` and `codex` CLIs with install links when missing

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
