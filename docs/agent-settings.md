# Agent Settings & Configuration

How agent behavior is configured for eval runs. Each agent has three layers of configuration: environment variables, config files copied into the workspace, and CLI flags.

## Environment Variables

Set in `.env` at the project root (loaded via dotenv).

### Per-Agent Variables

Pattern: `{AGENT}_MODEL`, `{AGENT}_ADDITIONAL_ARGS` where `{AGENT}` is `CLAUDE`, `CURSOR`, or `CODEX`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLAUDE_MODEL` | no | agent default | Model for claude CLI |
| `CURSOR_MODEL` | no | agent default | Model for cursor-agent CLI |
| `CODEX_MODEL` | no | agent default | Model for codex CLI |
| `{AGENT}_ADDITIONAL_ARGS` | no | (none) | Space-separated CLI args appended to the agent command |

### Timeout Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_TIMEOUT_MS` | no | 300000 (5 min) | Overall timeout for a single task execution |
| `AGENT_IDLE_TIMEOUT_MS` | no | 120000 (2 min) | Kill agent after this long with no stdout output |

### Evaluation Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | yes | — | API key for eval scoring |
| `EVAL_MODEL` | no | `gpt-5-mini` | Model used for LLM-based evaluation |

## Config Files

Agent-specific config files live in `config/` and are copied into the workspace during bootstrapping (`copyAgentConfig()` in `run-tasks.js`). This gives each agent its own permission rules and system prompt.

### Claude

| Source | Workspace Destination | Purpose |
|--------|----------------------|---------|
| `config/claude-settings.json` | `.claude/settings.json` | Permission allow/deny lists (Bash commands, Read, Write, etc.) |
| `config/claude-system-prompt-append.txt` | (passed via `--append-system-prompt`) | System prompt injected at runtime |

Permission format uses Claude's tool-scoped patterns: `Bash(git add *)`, `Read`, `Write`, `WebFetch`, etc. Deny rules block specific dangerous commands (force push, repo delete).

### Cursor

| Source | Workspace Destination | Purpose |
|--------|----------------------|---------|
| `config/cursor-cli.json` | `.cursor/cli.json` | Permission allow/deny lists |
| `config/cursor-system-prompt.md` | `.cursor/rules/system-prompt.md` | System prompt (via `alwaysApply: true` frontmatter) |

Permission format uses Cursor's patterns: `Shell(git)`, `Read(**)`, `Write(**)`, `WebFetch(*)`. Deny rules take precedence over allow rules.

### Codex

| Source | Workspace Destination | Purpose |
|--------|----------------------|---------|
| `config/codex-config.toml` | `.codex/config.toml` | Developer instructions (system prompt) and network access |

Codex has a fundamentally different permission model — no per-command allow/deny lists. The sandbox constrains filesystem scope and the approval policy is all-or-nothing. Individual commands within the sandbox are unrestricted.

## CLI Flags

Each handler builds its own CLI args in `buildArgs()`.

### Claude

| Flag | Value | Purpose |
|------|-------|---------|
| `--verbose` | — | Verbose output |
| `--output-format` | `stream-json` | Structured streaming output |
| `--setting-sources` | `project` | **Settings isolation** — only loads project-level config, ignoring `~/.claude/settings.json` and `~/.claude/CLAUDE.md` |
| `--append-system-prompt` | (from config file) | Injects system prompt |
| `--model` | (from env) | Model override (when set) |

### Cursor

| Flag | Value | Purpose |
|------|-------|---------|
| `--trust` | — | Trust workspace in headless mode (loads `.cursor/cli.json`) |
| `--output-format` | `stream-json` | Structured streaming output |
| `--model` | (from env) | Model override (when set) |

### Codex

| Flag | Value | Purpose |
|------|-------|---------|
| `exec` | — | Non-interactive execution mode |
| `--sandbox` | `workspace-write` | Filesystem writes constrained to workspace |
| `--json` | — | JSON output |
| `--model` | (from env) | Model override (when set) |

## Known Limitations

### No settings isolation for cursor or codex

Claude's `--setting-sources project` prevents loading user-level config (`~/.claude/settings.json`, `~/.claude/CLAUDE.md`), ensuring reproducible behavior across machines. Neither cursor nor codex has an equivalent mechanism:

- **Cursor**: No `--setting-sources` flag or equivalent. User-level settings may leak into the agent's behavior.
- **Codex**: Has `--profile` for switching between named config presets, but profiles overlay on top of user config rather than replacing it. The resolution order is: CLI flags > profile > project config > user config > system config > defaults. Keys not set in the profile fall through to user defaults.

This means eval results for cursor and codex may vary between operators if they have personal settings that affect agent behavior (model preferences, custom instructions, etc.). CLI flags we pass explicitly (sandbox mode, approval policy, model) take highest priority and are not affected.

### No per-command permissions for codex

Claude and cursor support granular allow/deny lists (e.g., allow `git push` but deny `git push --force`). Codex's permission model is binary: the sandbox constrains filesystem scope, but all commands within that scope are unrestricted. There's no way to selectively block specific commands like force push.

### Cursor headless config loading is unverified

Whether cursor-agent loads `.cursor/cli.json` and `.cursor/rules/` files in headless `--print` mode is not documented. The `--trust` flag should enable this, but it hasn't been verified empirically yet.
