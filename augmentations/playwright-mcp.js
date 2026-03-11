import fs from 'fs/promises';
import path from 'path';

const mcpConfig = {
  mcpServers: {
    playwright: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
  },
};

const codexMcpSnippet = `
[mcp_servers.playwright]
command = "npx"
args = ["--yes", "@playwright/mcp"]
`;

export default {
  name: 'Playwright MCP',
  async augment({ workspaceDir, agent }) {
    if (agent === 'claude') {
      // Claude uses .mcp.json at project root
      const mcpPath = path.join(workspaceDir, '.mcp.json');
      await fs.writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    } else if (agent === 'cursor') {
      // Cursor uses .cursor/mcp.json
      const mcpDir = path.join(workspaceDir, '.cursor');
      await fs.mkdir(mcpDir, { recursive: true });
      await fs.writeFile(
        path.join(mcpDir, 'mcp.json'),
        JSON.stringify(mcpConfig, null, 2) + '\n',
      );
    } else if (agent === 'codex') {
      // Codex uses .codex/config.toml — append MCP section to existing config
      const configPath = path.join(workspaceDir, '.codex', 'config.toml');
      try {
        const existing = await fs.readFile(configPath, 'utf-8');
        await fs.writeFile(configPath, existing + codexMcpSnippet);
      } catch {
        // No existing config — write just the MCP snippet
        await fs.mkdir(path.join(workspaceDir, '.codex'), { recursive: true });
        await fs.writeFile(configPath, codexMcpSnippet.trimStart());
      }
    }
  },
};
