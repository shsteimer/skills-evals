import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';
import {
  killOrphanedProcesses,
  createIdleTimeout,
  wireAbortSignal,
  parseCodexActivity,
} from './shared.js';

/**
 * Run a task using the Codex CLI agent
 * @param {Object} task - The enriched task object
 * @param {Function} [onActivity] - Optional callback for activity updates
 * @param {AbortSignal} [signal] - Optional signal to abort/kill the agent
 */
export default async function runCodex(task, onActivity, signal) {
  return new Promise((resolve, reject) => {
    const config = getAgentConfig('codex');

    // Build arguments array
    const args = [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
    ];

    // Add model if specified
    if (config.model) {
      args.push('--model', config.model);
    }

    // Add any additional arguments
    const additionalArgs = parseAdditionalArgs(config.additionalArgs);
    args.push(...additionalArgs);

    const codex = spawn('codex', args, {
      cwd: task.workspaceDir,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const idle = createIdleTimeout(codex, onActivity);
    wireAbortSignal(signal, codex, idle);

    // Write prompt to stdin
    codex.stdin.write(task.prompt);
    codex.stdin.end();

    // Capture stdout (JSON output)
    let outputData = '';
    codex.stdout.on('data', (data) => {
      idle.reset();
      const chunk = data.toString();
      outputData += chunk;
      parseCodexActivity(chunk, onActivity);
    });

    codex.on('error', (error) => {
      idle.clear();
      reject(new Error(`Failed to spawn codex CLI: ${error.message}`));
    });

    codex.on('close', async (code) => {
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
        reject(new Error(`Codex CLI exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
