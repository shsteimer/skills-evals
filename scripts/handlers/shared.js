import { execSync } from 'child_process';
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
 */
export function createIdleTimeout(childProcess, onActivity) {
  const timeoutMs = parseInt(getEnv('AGENT_IDLE_TIMEOUT_MS', ''), 10) || 2 * 60 * 1000;
  let idledOut = false;

  function startTimer() {
    return setTimeout(() => {
      idledOut = true;
      if (onActivity) onActivity('idle timeout, killing...');
      childProcess.kill('SIGTERM');
      setTimeout(() => childProcess.kill('SIGKILL'), 5000);
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
 * Wire up an AbortSignal to kill the child process and clear the idle timer.
 */
export function wireAbortSignal(signal, childProcess, idleTimeout) {
  if (!signal) return;

  const onAbort = () => {
    idleTimeout.clear();
    childProcess.kill('SIGTERM');
    setTimeout(() => childProcess.kill('SIGKILL'), 5000);
  };

  if (signal.aborted) {
    idleTimeout.clear();
    childProcess.kill('SIGTERM');
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

// Inline basename to avoid importing path (keeps this module lightweight)
function basename(filePath) {
  const i = filePath.lastIndexOf('/');
  return i >= 0 ? filePath.slice(i + 1) : filePath;
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
