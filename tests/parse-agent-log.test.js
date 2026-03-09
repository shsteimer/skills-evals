import { describe, it, expect } from 'vitest';
import { parseAgentLog, formatAgentSummary } from '../scripts/parse-agent-log.js';

describe('parseAgentLog — Claude stream-json format', () => {
  it('should extract assistant text', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello there.' }] },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{ type: 'assistant_text', text: 'Hello there.' }]);
  });

  it('should extract tool_use with Bash command', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use', name: 'Bash', id: 'tool_1',
          input: { command: 'npm test' },
        }],
      },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'tool_call', tool: 'Bash', id: 'tool_1', input: 'npm test',
    }]);
  });

  it('should extract result event', () => {
    const content = JSON.stringify({
      type: 'result', subtype: 'success',
      cost_usd: 0.05, duration_ms: 3000, num_turns: 2,
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'result', subtype: 'success', cost: 0.05, duration: 3000, turns: 2,
    }]);
  });

  it('should extract subagent_completed', () => {
    const content = JSON.stringify({
      type: 'system', subtype: 'task_completed', task_id: 'abc',
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{ type: 'subagent_completed', taskId: 'abc' }]);
  });

  it('should skip thinking and system init events', () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init', model: 'claude' }),
      JSON.stringify({ type: 'thinking', subtype: 'delta', text: 'hmm' }),
      JSON.stringify({ type: 'user', message: { content: [] } }),
    ].join('\n');
    const events = parseAgentLog(lines);
    expect(events).toEqual([]);
  });

  it('should handle multiple events in one log', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Starting.' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use', name: 'Read', id: 'r1',
            input: { file_path: '/a/b/foo.js' },
          }],
        },
      }),
      JSON.stringify({
        type: 'result', subtype: 'success', duration_ms: 1000,
      }),
    ].join('\n');
    const events = parseAgentLog(lines);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('assistant_text');
    expect(events[1].type).toBe('tool_call');
    expect(events[2].type).toBe('result');
  });
});

describe('parseAgentLog — Cursor stream-json format', () => {
  it('should extract tool_call events with editToolCall', () => {
    const content = JSON.stringify({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'toolu_123',
      tool_call: {
        editToolCall: {
          args: { path: '/workspace/hello.txt', streamContent: 'Hello' },
        },
      },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'tool_call', tool: 'edit', id: 'toolu_123', input: '/workspace/hello.txt',
    }]);
  });

  it('should extract tool_call events with shellToolCall', () => {
    const content = JSON.stringify({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'toolu_456',
      tool_call: {
        shellToolCall: {
          args: { command: 'npm test' },
        },
      },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'tool_call', tool: 'shell', id: 'toolu_456', input: 'npm test',
    }]);
  });

  it('should extract tool_call events with listMcpResourcesToolCall', () => {
    const content = JSON.stringify({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'toolu_789',
      tool_call: {
        listMcpResourcesToolCall: { args: {} },
      },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'tool_call', tool: 'listMcpResources', id: 'toolu_789', input: '{}',
    }]);
  });

  it('should skip tool_call completed events (already captured on started)', () => {
    const content = JSON.stringify({
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'toolu_123',
      tool_call: {
        editToolCall: {
          args: { path: '/workspace/hello.txt' },
          result: { success: {} },
        },
      },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([]);
  });

  it('should handle a mixed cursor conversation', () => {
    const lines = [
      JSON.stringify({
        type: 'system', subtype: 'init', model: 'Claude 4.5 Sonnet',
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'I will create the file.' }] },
      }),
      JSON.stringify({
        type: 'tool_call', subtype: 'started', call_id: 'tc1',
        tool_call: { editToolCall: { args: { path: '/a/b.txt', streamContent: 'hi' } } },
      }),
      JSON.stringify({
        type: 'tool_call', subtype: 'completed', call_id: 'tc1',
        tool_call: { editToolCall: { args: { path: '/a/b.txt' }, result: { success: {} } } },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Done!' }] },
      }),
      JSON.stringify({
        type: 'result', subtype: 'success', duration_ms: 5000,
      }),
    ].join('\n');
    const events = parseAgentLog(lines);
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: 'assistant_text', text: 'I will create the file.' });
    expect(events[1]).toEqual({ type: 'tool_call', tool: 'edit', id: 'tc1', input: '/a/b.txt' });
    expect(events[2]).toEqual({ type: 'assistant_text', text: 'Done!' });
    expect(events[3].type).toBe('result');
  });
});

describe('parseAgentLog — Codex JSON format', () => {
  it('should extract command_execution as tool_call', () => {
    const content = JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'item_1', type: 'command_execution',
        command: '/bin/zsh -lc ls',
        aggregated_output: 'file1\nfile2\n',
        exit_code: 0, status: 'completed',
      },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'tool_call', tool: 'shell', id: 'item_1', input: 'ls',
    }]);
  });

  it('should extract agent_message as assistant_text', () => {
    const content = JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_2', type: 'agent_message', text: 'Done! Created the file.' },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{ type: 'assistant_text', text: 'Done! Created the file.' }]);
  });

  it('should extract reasoning as assistant_text', () => {
    const content = JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_0', type: 'reasoning', text: '**Preparing to inspect files**' },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{ type: 'assistant_text', text: '**Preparing to inspect files**' }]);
  });

  it('should extract turn.completed usage as result', () => {
    const content = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 15000, output_tokens: 200 },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{
      type: 'result', subtype: 'success',
      cost: undefined, duration: undefined, turns: undefined,
    }]);
  });

  it('should skip item.started events (duplicates of item.completed)', () => {
    const content = JSON.stringify({
      type: 'item.started',
      item: { id: 'item_1', type: 'command_execution', command: 'ls' },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([]);
  });

  it('should skip thread.started and turn.started', () => {
    const lines = [
      JSON.stringify({ type: 'thread.started', thread_id: 'abc' }),
      JSON.stringify({ type: 'turn.started' }),
    ].join('\n');
    const events = parseAgentLog(lines);
    expect(events).toEqual([]);
  });

  it('should strip shell wrapper from commands', () => {
    const content = JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'item_1', type: 'command_execution',
        command: '/bin/zsh -lc "cat README.md"',
        exit_code: 0, status: 'completed',
      },
    });
    const events = parseAgentLog(content);
    expect(events[0].input).toBe('"cat README.md"');
  });

  it('should handle a full codex conversation', () => {
    const lines = [
      JSON.stringify({ type: 'thread.started', thread_id: 'abc' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_0', type: 'reasoning', text: 'Planning next steps' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1', type: 'command_execution',
          command: '/bin/zsh -lc ls', exit_code: 0, status: 'completed',
        },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_2', type: 'agent_message', text: 'All done.' },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 5000, output_tokens: 100 },
      }),
    ].join('\n');
    const events = parseAgentLog(lines);
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: 'assistant_text', text: 'Planning next steps' });
    expect(events[1]).toEqual({ type: 'tool_call', tool: 'shell', id: 'item_1', input: 'ls' });
    expect(events[2]).toEqual({ type: 'assistant_text', text: 'All done.' });
    expect(events[3].type).toBe('result');
  });
});

describe('parseAgentLog — auto-detection', () => {
  it('should auto-detect claude format from assistant type', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hi' }] },
    });
    const events = parseAgentLog(content);
    expect(events).toEqual([{ type: 'assistant_text', text: 'Hi' }]);
  });

  it('should auto-detect codex format from thread.started', () => {
    const lines = [
      JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'i1', type: 'agent_message', text: 'Hello' },
      }),
    ].join('\n');
    const events = parseAgentLog(lines);
    expect(events).toEqual([{ type: 'assistant_text', text: 'Hello' }]);
  });

  it('should return empty array for empty input', () => {
    expect(parseAgentLog('')).toEqual([]);
    expect(parseAgentLog('   ')).toEqual([]);
  });

  it('should return empty array for invalid JSON', () => {
    expect(parseAgentLog('not json at all')).toEqual([]);
  });
});

describe('formatAgentSummary', () => {
  it('should format assistant text with step numbers', () => {
    const summary = formatAgentSummary([
      { type: 'assistant_text', text: 'Working on it.' },
    ]);
    expect(summary).toContain('Step 1');
    expect(summary).toContain('Working on it.');
  });

  it('should format tool calls', () => {
    const summary = formatAgentSummary([
      { type: 'tool_call', tool: 'Bash', input: 'npm test' },
    ]);
    expect(summary).toContain('-> Bash: npm test');
  });

  it('should format result', () => {
    const summary = formatAgentSummary([
      { type: 'result', subtype: 'success', cost: 0.05, duration: 3000, turns: 2 },
    ]);
    expect(summary).toContain('Result: success');
    expect(summary).toContain('$0.0500');
    expect(summary).toContain('3.0s');
    expect(summary).toContain('Turns: 2');
  });

  it('should truncate long assistant text to 500 chars', () => {
    const longText = 'A'.repeat(600);
    const summary = formatAgentSummary([
      { type: 'assistant_text', text: longText },
    ]);
    expect(summary).toContain('A'.repeat(500) + '...');
    expect(summary).not.toContain('A'.repeat(501));
  });
});
