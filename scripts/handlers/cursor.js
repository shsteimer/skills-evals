import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';
import { wrapWithSafehouse, buildBotAuthEnv } from '../utils/agent-launch.js';
import {
  killOrphanedProcesses,
  createIdleTimeout,
  wireAbortSignal,
  parseStreamActivity,
  captureStderr,
} from './shared.js';

/**
 * Build the CLI args array for the cursor-agent command.
 * Exported for testing.
 */
export function buildArgs() {
  const config = getAgentConfig('cursor');

  const args = [
    '--yolo',
    '--output-format', 'stream-json',
  ];

  if (config.model) {
    args.push('--model', config.model);
  }

  const additionalArgs = parseAdditionalArgs(config.additionalArgs);
  args.push(...additionalArgs);

  return args;
}

/**
 * Run a task using the Cursor CLI agent
 * @param {Object} task - The enriched task object
 * @param {Function} [onActivity] - Optional callback for activity updates
 * @param {AbortSignal} [signal] - Optional signal to abort/kill the agent
 */
export default async function runCursor(task, onActivity, signal) {
  return new Promise((resolve, reject) => {
    const agentArgs = buildArgs();
    const { env: authEnv, envPass } = buildBotAuthEnv(task.workspaceDir);
    const cursorEnvPass = [...envPass, 'CURSOR_API_KEY'];
    const { bin, args, env: safehouseEnv } = wrapWithSafehouse('cursor-agent', agentArgs, { envPass: cursorEnvPass });

    const cursor = spawn(bin, args, {
      cwd: task.workspaceDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...safehouseEnv, ...authEnv },
    });

    const { getStderr } = captureStderr(cursor, task.taskInfoFolder);
    const killOptions = { workspaceDir: task.workspaceDir };
    const idle = createIdleTimeout(cursor, onActivity, killOptions);
    wireAbortSignal(signal, cursor, idle, killOptions);

    // Write prompt to stdin
    cursor.stdin.write(task.prompt);
    cursor.stdin.end();

    // Capture stdout (JSON output)
    let outputData = '';
    cursor.stdout.on('data', (data) => {
      idle.reset();
      const chunk = data.toString();
      outputData += chunk;
      parseStreamActivity(chunk, onActivity);
    });

    cursor.on('error', (error) => {
      idle.clear();
      reject(new Error(`Failed to spawn cursor-agent CLI: ${error.message}`));
    });

    cursor.on('close', async (code) => {
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
        const stderr = getStderr().trim().slice(-500);
        const detail = stderr ? `\n${stderr}` : '';
        reject(new Error(`Cursor agent CLI exited with code ${code}${detail}`));
      } else {
        resolve();
      }
    });
  });
}
