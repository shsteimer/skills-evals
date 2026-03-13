# Safehouse Configuration

Agent Safehouse wraps all agent processes to enforce kernel-level filesystem isolation.

## config.json

Primary safehouse configuration. Environment variables (`SAFEHOUSE_BIN`, `SAFEHOUSE_ENABLE`) override values here.

- `bin` — path to safehouse binary (default: `safehouse`)
- `enableFeatures` — optional comma-separated features to pass via `--enable` (see `safehouse --help`)
- `appendProfile` — optional path to a `.sb` sandbox policy override file, passed via `--append-profile`

## Default behavior

- Read/write access to the workspace directory (auto-detected git root)
- Read access to installed toolchains (node, npm, git, gh, etc.)
- Denies access to ~/.ssh, ~/.aws, ~/.config/gh, and other sensitive directories
- Network access is allowed

## Policy overrides

`local-overrides.sb` extends the default sandbox policy with rules needed for this project (e.g. allowing read access to system Chrome for playwright-cli). Edit this file to add or remove policy rules.

> **TODO (safehouse upgrade):** The `local-overrides.sb` file and the `PLAYWRIGHT_MCP_SANDBOX` env var in `config.json` duplicate rules from the unreleased `--enable=playwright-chrome` feature on agent-safehouse main (commits `8960fb89`, `168e3de5`). Once a safehouse release includes `playwright-chrome`, replace these with `"enableFeatures": "agent-browser,playwright-chrome"` and remove both `local-overrides.sb` and the `env` block from `config.json`.

To debug sandbox denials, watch the rejection log in a separate terminal:

```sh
/usr/bin/log stream --style compact --predicate 'eventMessage CONTAINS "Sandbox:" AND eventMessage CONTAINS "deny("'
```

## Testing the sandbox

```sh
# Should be denied:
safehouse cat ~/.ssh/id_ed25519

# Should work (from a workspace directory):
cd /path/to/workspace && safehouse ls .
```
