import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';

/**
 * Summarize a tool call for activity display
 */
function describeToolUse(block) {
  const tool = block.name || 'unknown';
  const input = block.input || {};

  switch (tool) {
    case 'Bash':
      return `$ ${(input.command || '').slice(0, 60)}`;
    case 'Read':
      return `reading ${path.basename(input.file_path || '')}`;
    case 'Write':
      return `writing ${path.basename(input.file_path || '')}`;
    case 'Edit':
      return `editing ${path.basename(input.file_path || '')}`;
    case 'Glob':
      return `searching ${input.pattern || ''}`;
    case 'Grep':
      return `grep ${input.pattern || ''}`;
    case 'WebFetch':
      return `fetching ${input.url || ''}`.slice(0, 80);
    default:
      return tool;
  }
}

/**
 * Parse stream-json chunks and extract tool use activity
 */
function parseStreamActivity(chunk, onActivity) {
  if (!onActivity) return;

  const lines = chunk.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant') continue;

      const content = obj.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === 'tool_use') {
          onActivity(describeToolUse(block));
        } else if (block.type === 'text' && block.text?.trim()) {
          const text = block.text.trim().replace(/\n/g, ' ').slice(0, 80);
          if (text) onActivity(text);
        }
      }
    } catch {
      // Not valid JSON or incomplete chunk - skip
    }
  }
}

/**
 * Run a task using the Claude CLI agent.
 * @param {Object} task - The enriched task object
 * @param {Function} [onActivity] - Optional callback for activity updates
 * @param {AbortSignal} [signal] - Optional signal to abort/kill the agent
 */
export default async function runClaude(task, onActivity, signal) {
  const config = getAgentConfig('claude');

  const args = [
    '--verbose',
    '--output-format', 'stream-json',
    // Isolate from user's personal settings (~/.claude/CLAUDE.md, ~/.claude/settings.json)
    // Permissions and tool lists are managed via config/claude-settings.json,
    // copied into the workspace as .claude/settings.json during bootstrapping
    '--setting-sources', 'project',
  ];

  if (config.model) {
    args.push('--model', config.model);
  }

  const additionalArgs = parseAdditionalArgs(config.additionalArgs);
  args.push(...additionalArgs);

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

  return new Promise((resolve, reject) => {
    const claude = spawn('claude', args, {
      cwd: task.workspaceDir,
      stdio: ['pipe', 'pipe', 'inherit'],
      env,
    });

    // Idle timeout — kill if no stdout output for IDLE_TIMEOUT_MS
    let idledOut = false;

    function startIdleTimer() {
      return setTimeout(() => {
        idledOut = true;
        if (onActivity) onActivity('idle timeout, killing...');
        claude.kill('SIGTERM');
        setTimeout(() => claude.kill('SIGKILL'), 5000);
      }, IDLE_TIMEOUT_MS);
    }

    let idleTimer = startIdleTimer();

    function resetIdleTimer() {
      clearTimeout(idleTimer);
      idleTimer = startIdleTimer();
    }

    if (signal) {
      const onAbort = () => {
        clearTimeout(idleTimer);
        claude.kill('SIGTERM');
        setTimeout(() => claude.kill('SIGKILL'), 5000);
      };
      if (signal.aborted) {
        clearTimeout(idleTimer);
        claude.kill('SIGTERM');
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
        claude.on('close', () => signal.removeEventListener('abort', onAbort));
      }
    }

    claude.stdin.write(task.prompt);
    claude.stdin.end();

    let outputData = '';
    claude.stdout.on('data', (data) => {
      resetIdleTimer();
      const chunk = data.toString();
      outputData += chunk;
      parseStreamActivity(chunk, onActivity);
    });

    claude.on('error', (error) => {
      clearTimeout(idleTimer);
      reject(new Error(`Failed to spawn claude CLI: ${error.message}`));
    });

    claude.on('close', async (code) => {
      clearTimeout(idleTimer);

      // Save output regardless of exit code — partial results are useful
      try {
        const outputPath = path.join(task.taskInfoFolder, 'output.jsonl');
        await fs.writeFile(outputPath, outputData, 'utf-8');
      } catch {
        // best-effort save
      }

      if (idledOut) {
        reject(new Error(`Agent idle for ${IDLE_TIMEOUT_MS / 1000}s with no output`));
      } else if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
