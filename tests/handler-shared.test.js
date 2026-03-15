import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../scripts/utils/env-config.js', () => ({
  getEnv: vi.fn(() => ''),
}));

import {
  parseStreamActivity,
  parseCodexActivity,
  createIdleTimeout,
  wireAbortSignal,
  forceKillTree,
} from '../scripts/handlers/shared.js';
import { getEnv } from '../scripts/utils/env-config.js';

describe('parseStreamActivity', () => {
  it('should extract tool_use activity from assistant messages', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
        ],
      },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['$ npm test']);
  });

  it('should extract text blocks from assistant messages', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Working on the fix now.' },
        ],
      },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['Working on the fix now.']);
  });

  it('should truncate text to 80 chars', () => {
    const activities = [];
    const longText = 'A'.repeat(100);
    const chunk = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: longText }] },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities[0]).toHaveLength(80);
  });

  it('should skip non-assistant messages', () => {
    const activities = [];
    const chunk = JSON.stringify({ type: 'user', message: { content: [] } });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual([]);
  });

  it('should handle multiple lines in a chunk', () => {
    const activities = [];
    const lines = [
      JSON.stringify({ type: 'thinking', text: 'hmm' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b/foo.js' } }] },
      }),
    ].join('\n');
    parseStreamActivity(lines, (msg) => activities.push(msg));
    expect(activities).toEqual(['reading foo.js']);
  });

  it('should not throw on malformed JSON', () => {
    const activities = [];
    parseStreamActivity('not json\n{also bad', (msg) => activities.push(msg));
    expect(activities).toEqual([]);
  });

  it('should do nothing when onActivity is null', () => {
    // Should not throw
    parseStreamActivity('{}', null);
  });

  it('should describe Write tool', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/x/y/out.txt' } }] },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['writing out.txt']);
  });

  it('should describe Edit tool', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/x/y/file.js' } }] },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['editing file.js']);
  });

  it('should describe Glob tool', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } }] },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['searching **/*.ts']);
  });

  it('should describe Grep tool', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'TODO' } }] },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['grep TODO']);
  });

  it('should describe unknown tools by name', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'CustomTool', input: {} }] },
    });
    parseStreamActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['CustomTool']);
  });
});

describe('parseCodexActivity', () => {
  it('should extract command_execution from item.started', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'item.started',
      item: { type: 'command_execution', command: '/bin/zsh -lc ls' },
    });
    parseCodexActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['$ ls']);
  });

  it('should strip shell wrapper from commands', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'item.started',
      item: { type: 'command_execution', command: '/bin/zsh -lc "npm install"' },
    });
    parseCodexActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['$ "npm install"']);
  });

  it('should truncate long commands to 60 chars', () => {
    const activities = [];
    const longCmd = `A${'B'.repeat(100)}`;
    const chunk = JSON.stringify({
      type: 'item.started',
      item: { type: 'command_execution', command: longCmd },
    });
    parseCodexActivity(chunk, (msg) => activities.push(msg));
    // "$ " prefix + 60 chars
    expect(activities[0]).toBe(`$ ${longCmd.slice(0, 60)}`);
  });

  it('should extract agent_message from item.completed', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Done! Created the file.' },
    });
    parseCodexActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual(['Done! Created the file.']);
  });

  it('should skip reasoning items', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'item.completed',
      item: { type: 'reasoning', text: 'Thinking about it...' },
    });
    parseCodexActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual([]);
  });

  it('should skip item.completed for command_execution (already reported on started)', () => {
    const activities = [];
    const chunk = JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'ls', exit_code: 0 },
    });
    parseCodexActivity(chunk, (msg) => activities.push(msg));
    expect(activities).toEqual([]);
  });

  it('should handle multiple lines', () => {
    const activities = [];
    const lines = [
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'item.started',
        item: { type: 'command_execution', command: '/bin/zsh -lc "cat README.md"' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'All done.' },
      }),
    ].join('\n');
    parseCodexActivity(lines, (msg) => activities.push(msg));
    expect(activities).toEqual(['$ "cat README.md"', 'All done.']);
  });

  it('should do nothing when onActivity is null', () => {
    parseCodexActivity('{}', null);
  });

  it('should not throw on malformed JSON', () => {
    const activities = [];
    parseCodexActivity('not json', (msg) => activities.push(msg));
    expect(activities).toEqual([]);
  });
});

describe('createIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  function makeMockProcess() {
    return {
      kill: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      stdout: { destroyed: false, destroy: vi.fn() },
      stderr: { destroyed: false, destroy: vi.fn() },
      stdin: { destroyed: false, destroy: vi.fn() },
    };
  }

  it('should kill process after timeout', () => {
    const proc = makeMockProcess();
    const onActivity = vi.fn();
    createIdleTimeout(proc, onActivity);

    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(onActivity).toHaveBeenCalledWith('idle timeout, killing...');
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('should escalate to SIGKILL after 5 seconds', () => {
    const proc = makeMockProcess();
    createIdleTimeout(proc, null);

    vi.advanceTimersByTime(2 * 60 * 1000); // idle fires
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

    vi.advanceTimersByTime(5000); // escalation fires
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('should destroy stdio streams after 10 seconds', () => {
    const proc = makeMockProcess();
    createIdleTimeout(proc, null);

    vi.advanceTimersByTime(2 * 60 * 1000); // idle fires
    vi.advanceTimersByTime(10000); // stream destruction fires

    expect(proc.stdout.destroy).toHaveBeenCalled();
    expect(proc.stderr.destroy).toHaveBeenCalled();
    expect(proc.stdin.destroy).toHaveBeenCalled();
  });

  it('should not destroy already-destroyed streams', () => {
    const proc = makeMockProcess();
    proc.stdout.destroyed = true;
    createIdleTimeout(proc, null);

    vi.advanceTimersByTime(2 * 60 * 1000 + 10000);

    expect(proc.stdout.destroy).not.toHaveBeenCalled();
    expect(proc.stderr.destroy).toHaveBeenCalled();
  });

  it('should not fire if reset before timeout', () => {
    const proc = makeMockProcess();
    const idle = createIdleTimeout(proc, null);

    vi.advanceTimersByTime(60 * 1000); // halfway
    idle.reset();
    vi.advanceTimersByTime(60 * 1000); // still within new window

    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('should fire after reset if no further resets', () => {
    const proc = makeMockProcess();
    const idle = createIdleTimeout(proc, null);

    idle.reset();
    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('should not fire after clear', () => {
    const proc = makeMockProcess();
    const idle = createIdleTimeout(proc, null);

    idle.clear();
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('should report idledOut status', () => {
    const proc = makeMockProcess();
    const idle = createIdleTimeout(proc, null);

    expect(idle.idledOut).toBe(false);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(idle.idledOut).toBe(true);
  });

  it('should use AGENT_IDLE_TIMEOUT_MS env var', () => {
    getEnv.mockReturnValue('5000');
    const proc = makeMockProcess();
    const idle = createIdleTimeout(proc, null);

    expect(idle.timeoutMs).toBe(5000);

    vi.advanceTimersByTime(4999);
    expect(proc.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('wireAbortSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function makeMockProcess() {
    return {
      kill: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      stdout: { destroyed: false, destroy: vi.fn() },
      stderr: { destroyed: false, destroy: vi.fn() },
      stdin: { destroyed: false, destroy: vi.fn() },
    };
  }

  function makeMockIdle() {
    return { clear: vi.fn(), reset: vi.fn() };
  }

  it('should kill immediately if signal already aborted', () => {
    const proc = makeMockProcess();
    const idle = makeMockIdle();
    const ac = new AbortController();
    ac.abort();

    wireAbortSignal(ac.signal, proc, idle);

    expect(idle.clear).toHaveBeenCalled();
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('should kill on abort event', () => {
    const proc = makeMockProcess();
    const idle = makeMockIdle();
    const ac = new AbortController();

    wireAbortSignal(ac.signal, proc, idle);

    expect(proc.kill).not.toHaveBeenCalled();
    ac.abort();

    expect(idle.clear).toHaveBeenCalled();
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('should escalate to SIGKILL after 5 seconds on abort', () => {
    const proc = makeMockProcess();
    const idle = makeMockIdle();
    const ac = new AbortController();

    wireAbortSignal(ac.signal, proc, idle);
    ac.abort();

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    vi.advanceTimersByTime(5000);
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('should destroy stdio after 10 seconds on abort', () => {
    const proc = makeMockProcess();
    const idle = makeMockIdle();
    const ac = new AbortController();

    wireAbortSignal(ac.signal, proc, idle);
    ac.abort();

    vi.advanceTimersByTime(10000);
    expect(proc.stdout.destroy).toHaveBeenCalled();
    expect(proc.stderr.destroy).toHaveBeenCalled();
  });

  it('should do nothing if signal is null', () => {
    const proc = makeMockProcess();
    const idle = makeMockIdle();
    wireAbortSignal(null, proc, idle);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('should clean up listener on process close', () => {
    const proc = makeMockProcess();
    const idle = makeMockIdle();
    const ac = new AbortController();

    wireAbortSignal(ac.signal, proc, idle);

    // Simulate close — the handler registered with proc.on('close', ...) should remove the listener
    const closeCallback = proc.on.mock.calls.find((c) => c[0] === 'close')?.[1];
    expect(closeCallback).toBeDefined();
    closeCallback();

    // After close cleanup, aborting should not kill again
    proc.kill.mockClear();
    ac.abort();
    expect(proc.kill).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('forceKillTree', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function makeMockProcess() {
    const listeners = {};
    return {
      kill: vi.fn(),
      once(event, fn) { listeners[event] = fn; },
      _emit(event) { if (listeners[event]) listeners[event](); },
      stdout: { destroyed: false, destroy: vi.fn() },
      stderr: { destroyed: false, destroy: vi.fn() },
      stdin: { destroyed: false, destroy: vi.fn() },
    };
  }

  it('should fully escalate when process never closes', () => {
    const proc = makeMockProcess();
    forceKillTree(proc);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');

    vi.advanceTimersByTime(5000);
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');

    vi.advanceTimersByTime(5000);
    expect(proc.stdout.destroy).toHaveBeenCalled();
    expect(proc.stderr.destroy).toHaveBeenCalled();
    expect(proc.stdin.destroy).toHaveBeenCalled();
  });

  it('should skip SIGKILL and stream destroy if close fires after SIGTERM', () => {
    const proc = makeMockProcess();
    forceKillTree(proc);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

    // Simulate close firing at 2s
    vi.advanceTimersByTime(2000);
    proc._emit('close');

    vi.advanceTimersByTime(8000); // past both escalation points
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
    expect(proc.stdout.destroy).not.toHaveBeenCalled();
  });

  it('should skip stream destroy if close fires after orphan kill', () => {
    const proc = makeMockProcess();
    forceKillTree(proc);

    vi.advanceTimersByTime(5000); // SIGKILL + orphan kill fires
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');

    // Simulate close firing at 7s (orphan kill unblocked it)
    vi.advanceTimersByTime(2000);
    proc._emit('close');

    vi.advanceTimersByTime(3000); // past stream destroy point
    expect(proc.stdout.destroy).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
