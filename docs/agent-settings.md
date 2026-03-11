# Agent Settings & Configuration

How agent behavior is configured for eval runs. Each agent has three layers of configuration: environment variables, config files copied into the workspace, and CLI flags. All agents run inside Agent Safehouse for kernel-level filesystem isolation.

## Sandboxing Model

The primary safety boundary is **Agent Safehouse**, not the agents' built-in permission models. All agents run in broad/no-sandbox mode, with Safehouse enforcing filesystem and process isolation at the kernel level via macOS `sandbox-exec`.

What Safehouse provides:
- Read/write access only to the workspace directory (auto-detected git root)
- Read access to installed toolchains (node, npm, git, gh, etc.)
- Denies access to `~/.ssh`, `~/.aws`, `~/.config/gh`, and other sensitive directories
- Network access is allowed (agents need npm, git push, gh)

Each agent process is spawned as `safehouse <agent-binary> <args>`. Safehouse configuration lives in `config/safehouse/config.json`:

```json
{
  "bin": "safehouse",
  "enableFeatures": "chromium-headless"
}
```

- `bin` — path to safehouse binary (default: `safehouse` on PATH)
- `enableFeatures` — comma-separated `--enable` features (see `safehouse --help`)

The `chromium-headless` feature grants Playwright's bundled Chromium the additional mach service and filesystem access it needs to launch inside the sandbox. The Playwright MCP augmentation is configured with `--headless` to use bundled Chromium rather than system Chrome, which requires fewer sandbox permissions.

Environment variables `SAFEHOUSE_BIN` and `SAFEHOUSE_ENABLE` override the config file values.

### Environment variable passthrough

Safehouse sanitizes the environment by default, only passing through a curated allowlist (HOME, PATH, SHELL, etc.). Agent-specific env vars (API keys, auth tokens) must be explicitly declared for passthrough via `--env-pass`. Each handler declares which vars it needs:

- **All agents**: Bot auth vars (`GH_TOKEN`, `EVAL_GH_TOKEN`, `GH_CONFIG_DIR`, `GH_PROMPT_DISABLED`, `GIT_ASKPASS`, `GIT_TERMINAL_PROMPT`)
- **Cursor**: `CURSOR_API_KEY`
- **Codex**: `OPENAI_API_KEY`

## Bot Auth Isolation

When `EVAL_GH_TOKEN` is set, workspace-local bot credentials are injected into each agent process. This keeps the operator's personal git/gh config untouched.

Per-workspace setup:
- `git config --local user.name` and `user.email` set to the bot account
- A workspace-local `GIT_ASKPASS` script authenticates git operations via the bot token
- `GH_TOKEN`, `GH_CONFIG_DIR`, and `GH_PROMPT_DISABLED` are set in the agent's env
- `GIT_TERMINAL_PROMPT=0` prevents interactive auth prompts

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

### Safehouse & Bot Auth Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SAFEHOUSE_BIN` | no | from `config/safehouse/config.json` | Override safehouse binary path |
| `SAFEHOUSE_ENABLE` | no | from `config/safehouse/config.json` | Override safehouse enable features |
| `EVAL_GH_TOKEN` | no | (none) | Fine-grained PAT for the bot account. When set, enables workspace-local bot auth |
| `EVAL_GIT_NAME` | no | `skills-evals-bot` | Git author name for bot commits |
| `EVAL_GIT_EMAIL` | no | `skills-evals-bot@users.noreply.github.com` | Git author email for bot commits |

## Config Files

Agent-specific config files live in `config/` and are copied into the workspace during bootstrapping. With Safehouse as the outer boundary and all agents in broad mode, the only config files that remain are system prompts — all three tell the agent to kill background processes when done.

| Source | Agent | Workspace Destination | Purpose |
|--------|-------|----------------------|---------|
| `config/claude-system-prompt-append.txt` | Claude | (passed via `--append-system-prompt`) | System prompt injected at runtime |
| `config/cursor-system-prompt.md` | Cursor | `.cursor/rules/system-prompt.md` | System prompt (via `alwaysApply: true` frontmatter) |
| `config/codex-config.toml` | Codex | `.codex/config.toml` | Developer instructions (system prompt) |

No permission allow/deny lists or sandbox escape rules are used — those are unnecessary when agents run in broad mode under Safehouse.

## CLI Flags

Each handler builds its own CLI args in `buildArgs()`. All agents are wrapped in safehouse at spawn time.

### Claude

| Flag | Value | Purpose |
|------|-------|---------|
| `--dangerously-skip-permissions` | — | Broad mode (Safehouse is the real boundary) |
| `--verbose` | — | Verbose output |
| `--output-format` | `stream-json` | Structured streaming output |
| `--setting-sources` | `project` | **Settings isolation** — only loads project-level config, ignoring `~/.claude/settings.json` and `~/.claude/CLAUDE.md` |
| `--append-system-prompt` | (from config file) | Injects system prompt |
| `--model` | (from env) | Model override (when set) |

### Cursor

| Flag | Value | Purpose |
|------|-------|---------|
| `--yolo` | — | Broad mode (Safehouse is the real boundary) |
| `--output-format` | `stream-json` | Structured streaming output |
| `--model` | (from env) | Model override (when set) |

### Codex

| Flag | Value | Purpose |
|------|-------|---------|
| `exec` | — | Non-interactive execution mode |
| `--dangerously-bypass-approvals-and-sandbox` | — | Broad mode (Safehouse is the real boundary) |
| `--json` | — | JSON output |
| `--model` | (from env) | Model override (when set) |

## Known Limitations

### No settings isolation for cursor or codex

Claude's `--setting-sources project` prevents loading user-level config (`~/.claude/settings.json`, `~/.claude/CLAUDE.md`), ensuring reproducible behavior across machines. Neither cursor nor codex has an equivalent mechanism:

- **Cursor**: No `--setting-sources` flag or equivalent. User-level settings may leak into the agent's behavior.
- **Codex**: Has `--profile` for switching between named config presets, but profiles overlay on top of user config rather than replacing it. The resolution order is: CLI flags > profile > project config > user config > system config > defaults. Keys not set in the profile fall through to user defaults.

This means eval results for cursor and codex may vary between operators if they have personal settings that affect agent behavior (model preferences, custom instructions, etc.). CLI flags we pass explicitly take highest priority and are not affected.

### Cursor headless config loading is unverified

Whether cursor-agent loads `.cursor/cli.json` and `.cursor/rules/` files in headless `--print` mode is not documented. The `--yolo` flag should enable this, but it hasn't been verified empirically yet.
