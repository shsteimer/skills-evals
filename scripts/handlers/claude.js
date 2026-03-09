import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';
import {
  killOrphanedProcesses,
  createIdleTimeout,
  wireAbortSignal,
  parseStreamActivity,
} from './shared.js';

/**
 * Run a task using the Claude CLI agent.
 * @param {Object} task - The enriched task object
 * @param {Function} [onActivity] - Optional callback for activity updates
 * @param {AbortSignal} [signal] - Optional signal to abort/kill the agent
 */
/**
 * Build the CLI args array for the claude command.
 * Exported for testing.
 */
export async function buildArgs(configDir) {
  const args = [
    '--verbose',
    '--output-format', 'stream-json',
    // Isolate from user's personal settings (~/.claude/CLAUDE.md, ~/.claude/settings.json)
    // Permissions and tool lists are managed via config/claude-settings.json,
    // copied into the workspace as .claude/settings.json during bootstrapping
    '--setting-sources', 'project',
  ];

  // Append system prompt from config file if it exists
  const systemPromptPath = path.join(configDir, 'claude-system-prompt-append.txt');
  try {
    const systemPrompt = (await fs.readFile(systemPromptPath, 'utf-8')).trim();
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }
  } catch {
    // No system prompt file — that's fine
  }

  const config = getAgentConfig('claude');

  if (config.model) {
    args.push('--model', config.model);
  }

  const additionalArgs = parseAdditionalArgs(config.additionalArgs);
  args.push(...additionalArgs);

  return args;
}

const defaultConfigDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config');

export default async function runClaude(task, onActivity, signal) {
  const args = await buildArgs(defaultConfigDir);

  const env = { ...process.env };
  delete env.CLAUDECODE;

  return new Promise((resolve, reject) => {
    const claude = spawn('claude', args, {
      cwd: task.workspaceDir,
      stdio: ['pipe', 'pipe', 'inherit'],
      env,
    });

    const idle = createIdleTimeout(claude, onActivity);
    wireAbortSignal(signal, claude, idle);

    claude.stdin.write(task.prompt);
    claude.stdin.end();

    let outputData = '';
    claude.stdout.on('data', (data) => {
      idle.reset();
      const chunk = data.toString();
      outputData += chunk;
      parseStreamActivity(chunk, onActivity);
    });

    claude.on('error', (error) => {
      idle.clear();
      reject(new Error(`Failed to spawn claude CLI: ${error.message}`));
    });

    claude.on('close', async (code) => {
      idle.clear();
      killOrphanedProcesses(task.workspaceDir);

      // Save output regardless of exit code — partial results are useful
      try {
        const outputPath = path.join(task.taskInfoFolder, 'output.jsonl');
        await fs.writeFile(outputPath, outputData, 'utf-8');
      } catch {
        // best-effort save
      }

      if (idle.idledOut) {
        reject(new Error(`Agent idle for ${idle.timeoutMs / 1000}s with no output`));
      } else if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
