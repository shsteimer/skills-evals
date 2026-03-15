import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getEnv } from '../utils/env-config.js';

/**
 * Kill any processes whose working directory is inside the given path.
 * This catches orphaned child processes (e.g., dev servers) that were
 * spawned by the agent's Bash tool in their own process groups.
 */
export function killOrphanedProcesses(workspaceDir) {
  try {
    const output = execSync(
      `lsof +d "${workspaceDir}" -t 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (!output) return;

    const pids = [...new Set(output.split('\n').map((p) => parseInt(p, 10)).filter((p) => p > 0))];
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already dead
      }
    }

    // Escalate after a short delay
    setTimeout(() => {
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already dead
        }
      }
    }, 3000);
  } catch {
    // best-effort cleanup
  }
}

/**
 * Create an idle timeout that kills the process if no stdout is received
 * for AGENT_IDLE_TIMEOUT_MS (default 2 minutes).
 *
 * Returns { reset, clear, isIdledOut } control object.
 *
 * @param {import('child_process').ChildProcess} childProcess
 * @param {Function} [onActivity]
 * @param {Object} [options]
 * @param {string} [options.workspaceDir] - workspace path for killing orphaned subprocesses
 */
export function createIdleTimeout(childProcess, onActivity, options = {}) {
  const timeoutMs = parseInt(getEnv('AGENT_IDLE_TIMEOUT_MS', ''), 10) || 2 * 60 * 1000;
  let idledOut = false;

  function startTimer() {
    return setTimeout(() => {
      idledOut = true;
      if (onActivity) onActivity('idle timeout, killing...');
      forceKillTree(childProcess, options.workspaceDir);
    }, timeoutMs);
  }

  let timer = startTimer();

  return {
    reset() {
      clearTimeout(timer);
      timer = startTimer();
    },
    clear() {
      clearTimeout(timer);
    },
    get idledOut() {
      return idledOut;
    },
    get timeoutMs() {
      return timeoutMs;
    },
  };
}

/**
 * Kill a child process with progressive escalation.
 * Each step only runs if the previous one didn't unblock the 'close' event.
 *
 * Escalation sequence:
 * 1. SIGTERM the child
 * 2. After 5s (if still alive): SIGKILL the child + kill orphaned processes in workspaceDir
 * 3. After 10s (if close hasn't fired): destroy stdio streams to unblock 'close'
 */
export function forceKillTree(childProcess, workspaceDir) {
  let closed = false;
  childProcess.once('close', () => { closed = true; });

  childProcess.kill('SIGTERM');

  setTimeout(() => {
    if (closed) return;
    childProcess.kill('SIGKILL');
    if (workspaceDir) killOrphanedProcesses(workspaceDir);
  }, 5000);

  setTimeout(() => {
    if (closed) return;
    for (const stream of [childProcess.stdout, childProcess.stderr, childProcess.stdin]) {
      if (stream && !stream.destroyed) stream.destroy();
    }
  }, 10000);
}

/**
 * Wire up an AbortSignal to kill the child process and clear the idle timer.
 *
 * @param {AbortSignal} signal
 * @param {import('child_process').ChildProcess} childProcess
 * @param {{ clear: () => void }} idleTimeout
 * @param {Object} [options]
 * @param {string} [options.workspaceDir] - workspace path for killing orphaned subprocesses
 */
export function wireAbortSignal(signal, childProcess, idleTimeout, options = {}) {
  if (!signal) return;

  const onAbort = () => {
    idleTimeout.clear();
    forceKillTree(childProcess, options.workspaceDir);
  };

  if (signal.aborted) {
    idleTimeout.clear();
    forceKillTree(childProcess, options.workspaceDir);
  } else {
    signal.addEventListener('abort', onAbort, { once: true });
    childProcess.on('close', () => signal.removeEventListener('abort', onAbort));
  }
}

/**
 * Parse Claude/Cursor stream-json chunks and extract tool use activity.
 * Both agents emit the same format when using --output-format stream-json.
 */
export function parseStreamActivity(chunk, onActivity) {
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
 * Summarize a tool call for activity display (Claude/Cursor stream-json format).
 */
function describeToolUse(block) {
  const tool = block.name || 'unknown';
  const input = block.input || {};

  switch (tool) {
    case 'Bash':
      return `$ ${(input.command || '').slice(0, 60)}`;
    case 'Read':
      return `reading ${basename(input.file_path || '')}`;
    case 'Write':
      return `writing ${basename(input.file_path || '')}`;
    case 'Edit':
      return `editing ${basename(input.file_path || '')}`;
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

// Inline basename to avoid importing path for tool descriptions
function basename(filePath) {
  const i = filePath.lastIndexOf('/');
  return i >= 0 ? filePath.slice(i + 1) : filePath;
}

/**
 * Capture stderr from a child process and save it to the task info folder.
 * Returns a function to get the captured stderr content.
 *
 * @param {import('child_process').ChildProcess} child - The spawned process
 * @param {string} taskInfoFolder - Path to the task's result folder
 * @returns {{ getStderr: () => string }} Accessor for captured stderr
 */
export function captureStderr(child, taskInfoFolder) {
  let stderrData = '';

  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('close', async () => {
    if (stderrData.trim()) {
      try {
        await fs.writeFile(path.join(taskInfoFolder, 'stderr.log'), stderrData, 'utf-8');
      } catch {
        // best-effort save
      }
    }
  });

  return {
    getStderr() {
      return stderrData;
    },
  };
}

/**
 * Parse Codex JSON output and extract activity.
 * Codex emits item.started/item.completed events with command_execution and agent_message types.
 */
export function parseCodexActivity(chunk, onActivity) {
  if (!onActivity) return;

  const lines = chunk.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (obj.type === 'item.started' && obj.item?.type === 'command_execution') {
        const cmd = obj.item.command || '';
        // Strip the shell wrapper (e.g., `/bin/zsh -lc "..."`)
        const cleaned = cmd.replace(/^\/bin\/\w+\s+-\w+\s+/, '').slice(0, 60);
        onActivity(`$ ${cleaned}`);
      } else if (obj.type === 'item.completed' && obj.item?.type === 'agent_message') {
        const text = (obj.item.text || '').trim().replace(/\n/g, ' ').slice(0, 80);
        if (text) onActivity(text);
      }
    } catch {
      // Not valid JSON or incomplete chunk - skip
    }
  }
}
