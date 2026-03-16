import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testWorkspaceRoot = path.join(__dirname, 'fixtures', 'agent-launch-workspaces');

// Mock env-config to control env vars in tests
vi.mock('../scripts/utils/env-config.js', () => ({
  getSafehouseConfig: vi.fn(() => ({ bin: 'safehouse', enableFeatures: '', appendProfile: '', env: {} })),
  getBotAuthConfig: vi.fn(() => ({
    ghToken: 'ghp_test123',
    gitName: 'test-bot',
    gitEmail: 'test-bot@example.com',
  })),
}));

import {
  wrapWithSafehouse,
  buildBotAuthEnv,
  createAskpassScript,
  configureGitIdentity,
} from '../scripts/utils/agent-launch.js';
import { getSafehouseConfig, getBotAuthConfig } from '../scripts/utils/env-config.js';

describe('wrapWithSafehouse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSafehouseConfig.mockReturnValue({ bin: 'safehouse', enableFeatures: '', appendProfile: '', env: {} });
  });

  it('should prepend safehouse binary', () => {
    const result = wrapWithSafehouse('claude', ['--verbose']);
    expect(result.bin).toBe('safehouse');
    expect(result.args).toEqual(['claude', '--verbose']);
  });

  it('should use custom safehouse binary path', () => {
    getSafehouseConfig.mockReturnValue({ bin: '/usr/local/bin/safehouse', enableFeatures: '', appendProfile: '', env: {} });
    const result = wrapWithSafehouse('codex', ['exec']);
    expect(result.bin).toBe('/usr/local/bin/safehouse');
    expect(result.args).toEqual(['codex', 'exec']);
  });

  it('should pass through all agent args', () => {
    const agentArgs = ['exec', '--full-auto', '--json', '--model', 'o3'];
    const result = wrapWithSafehouse('codex', agentArgs);
    expect(result.args).toEqual(['codex', ...agentArgs]);
  });

  it('should include --enable flag when features are configured', () => {
    getSafehouseConfig.mockReturnValue({ bin: 'safehouse', enableFeatures: 'agent-browser', appendProfile: '', env: {} });
    const result = wrapWithSafehouse('claude', ['--verbose']);
    expect(result.args).toEqual(['--enable=agent-browser', 'claude', '--verbose']);
  });

  it('should include --append-profile flag when configured', () => {
    getSafehouseConfig.mockReturnValue({ bin: 'safehouse', enableFeatures: '', appendProfile: '/path/to/overrides.sb', env: {} });
    const result = wrapWithSafehouse('claude', ['--verbose']);
    expect(result.args).toEqual(['--append-profile=/path/to/overrides.sb', 'claude', '--verbose']);
  });

  it('should include both --enable and --append-profile when both configured', () => {
    getSafehouseConfig.mockReturnValue({ bin: 'safehouse', enableFeatures: 'agent-browser', appendProfile: '/path/to/overrides.sb', env: {} });
    const result = wrapWithSafehouse('claude', ['--verbose']);
    expect(result.args).toEqual(['--enable=agent-browser', '--append-profile=/path/to/overrides.sb', 'claude', '--verbose']);
  });

  it('should include --env-pass flag when envPass is provided', () => {
    const result = wrapWithSafehouse('claude', ['--verbose'], { envPass: ['GH_TOKEN', 'EVAL_GH_TOKEN'] });
    expect(result.args).toEqual(['--env-pass=GH_TOKEN,EVAL_GH_TOKEN', 'claude', '--verbose']);
  });

  it('should omit --env-pass when envPass is empty', () => {
    const result = wrapWithSafehouse('claude', ['--verbose'], { envPass: [] });
    expect(result.args).toEqual(['claude', '--verbose']);
  });

  it('should return safehouse env vars and include them in --env-pass', () => {
    getSafehouseConfig.mockReturnValue({
      bin: 'safehouse', enableFeatures: '', appendProfile: '', env: { CUSTOM_VAR: 'value' },
    });
    const result = wrapWithSafehouse('claude', ['--verbose'], { envPass: ['GH_TOKEN'] });
    expect(result.env).toEqual({ CUSTOM_VAR: 'value' });
    expect(result.args).toContain('--env-pass=GH_TOKEN,CUSTOM_VAR');
  });

  it('should pass safehouse env vars through even with no explicit envPass', () => {
    getSafehouseConfig.mockReturnValue({
      bin: 'safehouse', enableFeatures: '', appendProfile: '', env: { FOO: 'bar' },
    });
    const result = wrapWithSafehouse('claude', ['--verbose']);
    expect(result.env).toEqual({ FOO: 'bar' });
    expect(result.args).toContain('--env-pass=FOO');
  });
});

describe('buildBotAuthEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBotAuthConfig.mockReturnValue({
      ghToken: 'ghp_test123',
      gitName: 'test-bot',
      gitEmail: 'test-bot@example.com',
    });
  });

  it('should return auth env vars when token is configured', () => {
    const { env, envPass } = buildBotAuthEnv('/workspace/task-1');
    expect(env.GH_TOKEN).toBe('ghp_test123');
    expect(env.GH_CONFIG_DIR).toBe('/workspace/task-1/.gh');
    expect(env.GH_PROMPT_DISABLED).toBe('1');
    expect(env.GIT_ASKPASS).toBe('/workspace/task-1/.eval-bin/git-askpass.sh');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.EVAL_GH_TOKEN).toBe('ghp_test123');
    expect(envPass).toEqual(expect.arrayContaining(['GH_TOKEN', 'EVAL_GH_TOKEN', 'GIT_ASKPASS']));
  });

  it('should return empty env and envPass when no token configured', () => {
    getBotAuthConfig.mockReturnValue({
      ghToken: undefined,
      gitName: 'test-bot',
      gitEmail: 'test-bot@example.com',
    });
    const { env, envPass } = buildBotAuthEnv('/workspace/task-1');
    expect(env).toEqual({});
    expect(envPass).toEqual([]);
  });
});

describe('createAskpassScript', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getBotAuthConfig.mockReturnValue({
      ghToken: 'ghp_test123',
      gitName: 'test-bot',
      gitEmail: 'test-bot@example.com',
    });
    await fs.mkdir(testWorkspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testWorkspaceRoot, { recursive: true, force: true });
  });

  it('should create askpass script in .eval-bin/', async () => {
    const workspace = path.join(testWorkspaceRoot, 'ws1');
    await fs.mkdir(workspace, { recursive: true });

    await createAskpassScript(workspace);

    const scriptPath = path.join(workspace, '.eval-bin', 'git-askpass.sh');
    const content = await fs.readFile(scriptPath, 'utf-8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('x-access-token');
    expect(content).toContain('EVAL_GH_TOKEN');
  });

  it('should make the script executable', async () => {
    const workspace = path.join(testWorkspaceRoot, 'ws2');
    await fs.mkdir(workspace, { recursive: true });

    await createAskpassScript(workspace);

    const scriptPath = path.join(workspace, '.eval-bin', 'git-askpass.sh');
    const stats = await fs.stat(scriptPath);
    // Check owner execute bit
    expect(stats.mode & 0o100).toBeTruthy();
  });

  it('should skip when no token configured', async () => {
    getBotAuthConfig.mockReturnValue({
      ghToken: undefined,
      gitName: 'test-bot',
      gitEmail: 'test-bot@example.com',
    });

    const workspace = path.join(testWorkspaceRoot, 'ws3');
    await fs.mkdir(workspace, { recursive: true });

    await createAskpassScript(workspace);

    const binDirExists = await fs.access(path.join(workspace, '.eval-bin'))
      .then(() => true).catch(() => false);
    expect(binDirExists).toBe(false);
  });
});

describe('configureGitIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBotAuthConfig.mockReturnValue({
      ghToken: 'ghp_test123',
      gitName: 'test-bot',
      gitEmail: 'test-bot@example.com',
    });
  });

  it('should set local git user.name and user.email', () => {
    const mockExecSync = vi.fn();
    configureGitIdentity('/workspace/task-1', mockExecSync);

    expect(mockExecSync).toHaveBeenCalledWith(
      'git config --local user.name "test-bot"',
      { cwd: '/workspace/task-1' },
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      'git config --local user.email "test-bot@example.com"',
      { cwd: '/workspace/task-1' },
    );
  });

  it('should skip when no token configured', () => {
    getBotAuthConfig.mockReturnValue({
      ghToken: undefined,
      gitName: 'test-bot',
      gitEmail: 'test-bot@example.com',
    });

    const mockExecSync = vi.fn();
    configureGitIdentity('/workspace/task-1', mockExecSync);

    expect(mockExecSync).not.toHaveBeenCalled();
  });
});
