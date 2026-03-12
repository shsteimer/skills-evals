import fs from 'fs/promises';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

/**
 * Find a bundled Playwright browser executable.
 * Prefers chrome-headless-shell — it works under safehouse with just
 * chromium-headless and doesn't need Mach port bootstrap permissions.
 * Full Chromium needs chromium-full (Mach ports) and is a fallback only.
 */
function findBundledBrowserPath() {
  try {
    const cacheDir = path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright');
    const entries = readdirSync(cacheDir);

    // Prefer headless shell — minimal permissions, works with chromium-headless
    const shellDir = entries
      .filter(e => e.startsWith('chromium_headless_shell-'))
      .sort()
      .pop();
    if (shellDir) {
      const shellPath = path.join(cacheDir, shellDir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (existsSync(shellPath)) return shellPath;
    }

    // Fall back to full Chromium (needs chromium-full safehouse feature)
    const chromiumDir = entries
      .filter(e => /^chromium-\d+$/.test(e))
      .sort()
      .pop();
    if (chromiumDir) {
      const chromiumPath = path.join(
        cacheDir, chromiumDir,
        'chrome-mac-arm64',
        'Google Chrome for Testing.app',
        'Contents', 'MacOS', 'Google Chrome for Testing',
      );
      if (existsSync(chromiumPath)) return chromiumPath;
    }
  } catch {
    // Fall through
  }
  return null;
}

function buildMcpConfig() {
  const browserPath = findBundledBrowserPath();
  // Note: do NOT add -y/--yes before the package name — safehouse's npx-aware
  // profile resolver treats the second arg as the package name for basename,
  // and flags like -y cause `basename "-y"` to fail.
  // --no-sandbox disables Chromium's internal sandbox, which conflicts with
  // safehouse's macOS sandbox (nested sandboxing causes "Operation not permitted")
  const args = ['@playwright/mcp@latest', '--headless', '--no-sandbox'];
  if (browserPath) {
    args.push('--executable-path', browserPath);
  } else {
    process.stderr.write(
      '[playwright-mcp] WARNING: no bundled Playwright browser found — ' +
        'Playwright MCP will fall back to system Chrome, which fails under safehouse\n',
    );
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

/**
 * Convert the MCP config object to Codex TOML format.
 * Derives from the same buildMcpConfig() so both agents get identical args.
 */
function mcpConfigToToml(mcpConfig) {
  const { command, args } = mcpConfig.mcpServers.playwright;
  const argsToml = args.map(a => `"${a}"`).join(', ');
  return `[mcp_servers.playwright]
command = "${command}"
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
      const codexMcpSnippet = mcpConfigToToml(mcpConfig);
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
