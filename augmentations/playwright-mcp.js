import fs from 'fs/promises';
import path from 'path';

/**
 * Find the Playwright headless shell executable path.
 * This binary works under safehouse with just chromium-headless,
 * unlike system Chrome which needs extensive macOS permissions.
 */
function findHeadlessShellPath() {
  try {
    // Use Playwright's own registry to find the headless shell
    const cacheDir = path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright');
    const entries = require('fs').readdirSync(cacheDir);
    const shellDir = entries
      .filter(e => e.startsWith('chromium_headless_shell-'))
      .sort()
      .pop();
    if (shellDir) {
      const shellPath = path.join(cacheDir, shellDir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (require('fs').existsSync(shellPath)) return shellPath;
    }
  } catch {
    // Fall through
  }
  return null;
}

function buildMcpConfig() {
  const headlessShell = findHeadlessShellPath();
  const args = ['-y', '@playwright/mcp@latest', '--headless'];
  if (headlessShell) {
    args.push('--executable-path', headlessShell);
  }
  return {
    mcpServers: {
      playwright: {
        type: 'stdio',
        command: 'npx',
        args,
      },
    },
  };
}

function buildCodexMcpSnippet() {
  const headlessShell = findHeadlessShellPath();
  const args = ['--yes', '@playwright/mcp', '--headless'];
  if (headlessShell) {
    args.push('--executable-path', headlessShell);
  }
  const argsToml = args.map(a => `"${a}"`).join(', ');
  return `
[mcp_servers.playwright]
command = "npx"
args = [${argsToml}]
`;
}

export default {
  name: 'Playwright MCP',
  async augment({ workspaceDir, agent }) {
    const mcpConfig = buildMcpConfig();

    if (agent === 'claude') {
      const mcpPath = path.join(workspaceDir, '.mcp.json');
      await fs.writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    } else if (agent === 'cursor') {
      const mcpDir = path.join(workspaceDir, '.cursor');
      await fs.mkdir(mcpDir, { recursive: true });
      await fs.writeFile(
        path.join(mcpDir, 'mcp.json'),
        JSON.stringify(mcpConfig, null, 2) + '\n',
      );
    } else if (agent === 'codex') {
      const codexMcpSnippet = buildCodexMcpSnippet();
      const configPath = path.join(workspaceDir, '.codex', 'config.toml');
      try {
        const existing = await fs.readFile(configPath, 'utf-8');
        await fs.writeFile(configPath, existing + codexMcpSnippet);
      } catch {
        await fs.mkdir(path.join(workspaceDir, '.codex'), { recursive: true });
        await fs.writeFile(configPath, codexMcpSnippet.trimStart());
      }
    }
  },
};
