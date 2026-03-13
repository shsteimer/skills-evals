import fs from 'fs/promises';
import path from 'path';
import { getSafehouseConfig, getBotAuthConfig } from './env-config.js';

/**
 * Wrap an agent command in safehouse.
 *
 * @param {string} agentBin - The agent binary (e.g. 'claude', 'codex', 'cursor-agent')
 * @param {string[]} agentArgs - Args for the agent binary
 * @param {Object} [options]
 * @param {string[]} [options.envPass] - Env var names to pass through the sandbox
 * @returns {{ bin: string, args: string[], env: Object }} - Command, args, and extra env vars to spawn with
 */
export function wrapWithSafehouse(agentBin, agentArgs, options = {}) {
  const { bin, enableFeatures, appendProfile, env: safehouseEnv } = getSafehouseConfig();
  const safehouseArgs = [];
  if (enableFeatures) {
    safehouseArgs.push(`--enable=${enableFeatures}`);
  }
  if (appendProfile) {
    safehouseArgs.push(`--append-profile=${appendProfile}`);
  }
  const envPassList = [...(options.envPass || []), ...Object.keys(safehouseEnv)];
  if (envPassList.length > 0) {
    safehouseArgs.push(`--env-pass=${envPassList.join(',')}`);
  }
  return {
    bin,
    args: [...safehouseArgs, agentBin, ...agentArgs],
    env: safehouseEnv,
  };
}

/**
 * Build the environment variable overlay for bot auth isolation.
 * Returns only the extra vars to spread into the child env.
 *
 * @param {string} workspaceDir - The workspace directory
 * @returns {{ env: Object, envPass: string[] }} Environment overlay and var names for safehouse passthrough
 */
export function buildBotAuthEnv(workspaceDir) {
  const { ghToken } = getBotAuthConfig();
  if (!ghToken) return { env: {}, envPass: [] };

  const env = {
    GH_TOKEN: ghToken,
    GH_CONFIG_DIR: path.join(workspaceDir, '.gh'),
    GH_PROMPT_DISABLED: '1',
    GIT_ASKPASS: path.join(workspaceDir, '.eval-bin', 'git-askpass.sh'),
    GIT_TERMINAL_PROMPT: '0',
    EVAL_GH_TOKEN: ghToken,
  };

  return { env, envPass: Object.keys(env) };
}

/**
 * Create the workspace-local askpass script so git can authenticate
 * without touching the operator's global credential helpers.
 *
 * @param {string} workspaceDir - The workspace directory
 */
export async function createAskpassScript(workspaceDir) {
  const { ghToken } = getBotAuthConfig();
  if (!ghToken) return;

  const binDir = path.join(workspaceDir, '.eval-bin');
  await fs.mkdir(binDir, { recursive: true });

  const scriptPath = path.join(binDir, 'git-askpass.sh');
  const script = [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf \'%s\\n\' "x-access-token" ;;',
    '  *Password*) printf \'%s\\n\' "$EVAL_GH_TOKEN" ;;',
    '  *) printf \'\\n\' ;;',
    'esac',
  ].join('\n');

  await fs.writeFile(scriptPath, script, { mode: 0o755 });
}

/**
 * Configure workspace-local git identity using the bot account.
 *
 * @param {string} workspaceDir - The workspace directory
 * @param {import('child_process').execSync} execSyncFn - execSync function (for testability)
 */
export function configureGitIdentity(workspaceDir, execSyncFn) {
  const { ghToken, gitName, gitEmail } = getBotAuthConfig();
  if (!ghToken) return;

  execSyncFn(`git config --local user.name "${gitName}"`, { cwd: workspaceDir });
  execSyncFn(`git config --local user.email "${gitEmail}"`, { cwd: workspaceDir });
}
