import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../scripts/utils/env-config.js', () => ({
  getAgentConfig: vi.fn(() => ({ model: undefined, additionalArgs: '' })),
  parseAdditionalArgs: vi.fn(() => []),
  getEnv: vi.fn(() => undefined),
  getSafehouseConfig: vi.fn(() => ({ bin: 'safehouse' })),
  getBotAuthConfig: vi.fn(() => ({
    ghToken: undefined,
    gitName: 'skills-evals-bot',
    gitEmail: 'skills-evals-bot@users.noreply.github.com',
  })),
}));

import { buildArgs } from '../scripts/handlers/claude.js';
import { getAgentConfig, parseAdditionalArgs } from '../scripts/utils/env-config.js';

describe('buildArgs', () => {
  let configDir;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-handler-test-'));
    vi.clearAllMocks();
    getAgentConfig.mockReturnValue({ model: undefined, additionalArgs: '' });
    parseAdditionalArgs.mockReturnValue([]);
  });

  afterEach(async () => {
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('should include base args', async () => {
    const args = await buildArgs(configDir);
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--verbose');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--setting-sources');
    expect(args).toContain('project');
  });

  it('should append system prompt when config file exists', async () => {
    const promptPath = path.join(configDir, 'claude-system-prompt-append.txt');
    await fs.writeFile(promptPath, 'Kill background processes when done.');

    const args = await buildArgs(configDir);
    expect(args).toContain('--append-system-prompt');
    expect(args).toContain('Kill background processes when done.');
  });

  it('should skip system prompt when config file is missing', async () => {
    const args = await buildArgs(configDir);
    expect(args).not.toContain('--append-system-prompt');
  });

  it('should skip system prompt when config file is empty', async () => {
    const promptPath = path.join(configDir, 'claude-system-prompt-append.txt');
    await fs.writeFile(promptPath, '   \n  ');

    const args = await buildArgs(configDir);
    expect(args).not.toContain('--append-system-prompt');
  });

  it('should include model when configured', async () => {
    getAgentConfig.mockReturnValue({ model: 'claude-sonnet-4-20250514', additionalArgs: '' });

    const args = await buildArgs(configDir);
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-20250514');
  });

  it('should not include model when not configured', async () => {
    const args = await buildArgs(configDir);
    expect(args).not.toContain('--model');
  });

  it('should include additional args when configured', async () => {
    parseAdditionalArgs.mockReturnValue(['--max-turns', '50']);

    const args = await buildArgs(configDir);
    expect(args).toContain('--max-turns');
    expect(args).toContain('50');
  });
});
