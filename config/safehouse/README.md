# Safehouse Configuration

Agent Safehouse wraps all agent processes to enforce kernel-level filesystem isolation.

## config.json

Primary safehouse configuration. Environment variables (`SAFEHOUSE_BIN`, `SAFEHOUSE_ENABLE`) override values here.

- `bin` — path to safehouse binary (default: `safehouse`)
- `enableFeatures` — optional comma-separated features to pass via `--enable` (see `safehouse --help`)
## Default behavior

- Read/write access to the workspace directory (auto-detected git root)
- Read access to installed toolchains (node, npm, git, gh, etc.)
- Denies access to ~/.ssh, ~/.aws, ~/.config/gh, and other sensitive directories
- Network access is allowed

## Debugging

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
