import fs from 'fs/promises';
import path from 'path';

/**
 * Parse output.jsonl into a structured summary of what the agent did.
 *
 * Auto-detects format: Claude/Cursor (stream-json) vs Codex (item-based JSON).
 * Returns normalized events: assistant_text, tool_call, subagent_completed, result.
 */
export function parseAgentLog(jsonlContent) {
  const trimmed = jsonlContent.trim();
  if (!trimmed) return [];

  const lines = trimmed.split('\n').filter(Boolean);

  // Auto-detect format from the first parseable line
  const format = detectFormat(lines);
  return format === 'codex' ? parseCodexLog(lines) : parseStreamJsonLog(lines);
}

/**
 * Detect whether the log is codex format or stream-json (Claude/Cursor).
 */
function detectFormat(lines) {
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'thread.started' || obj.type === 'turn.started'
        || obj.type === 'turn.completed'
        || obj.type === 'item.started' || obj.type === 'item.completed') {
        return 'codex';
      }
      if (obj.type === 'system' || obj.type === 'assistant'
        || obj.type === 'user' || obj.type === 'thinking') {
        return 'stream-json';
      }
    } catch {
      continue;
    }
  }
  return 'stream-json'; // default fallback
}

/**
 * Parse Claude/Cursor stream-json format.
 */
function parseStreamJsonLog(lines) {
  const events = [];

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === 'assistant' && parsed.message?.content) {
      for (const block of parsed.message.content) {
        if (block.type === 'text' && block.text) {
          events.push({ type: 'assistant_text', text: block.text });
        } else if (block.type === 'tool_use') {
          events.push({
            type: 'tool_call',
            tool: block.name,
            id: block.id,
            input: summarizeToolInput(block),
          });
        }
      }
    } else if (parsed.type === 'tool_call' && parsed.subtype === 'started') {
      // Cursor emits tool calls as separate events (not inside assistant messages)
      const { tool, input } = parseCursorToolCall(parsed);
      events.push({
        type: 'tool_call',
        tool,
        id: parsed.call_id,
        input,
      });
    } else if (parsed.type === 'result') {
      events.push({
        type: 'result',
        subtype: parsed.subtype,
        cost: parsed.cost_usd,
        duration: parsed.duration_ms,
        turns: parsed.num_turns,
      });
    } else if (parsed.type === 'system' && parsed.subtype === 'task_completed') {
      events.push({
        type: 'subagent_completed',
        taskId: parsed.task_id,
      });
    }
  }

  return events;
}

function summarizeToolInput(block) {
  const input = block.input || {};
  switch (block.name) {
    case 'Bash': return input.command || '';
    case 'Read':
    case 'Write':
    case 'Edit': return input.file_path || '';
    case 'Grep': return `pattern="${input.pattern || ''}" path="${input.path || '.'}"`;
    case 'Glob': return input.pattern || '';
    case 'Agent': return input.description || input.prompt?.slice(0, 100) || '';
    default: return JSON.stringify(input).slice(0, 150);
  }
}

/**
 * Parse Cursor's tool_call event format.
 * Tool calls use the pattern: tool_call.{toolName}ToolCall.args
 * e.g., editToolCall, shellToolCall, listMcpResourcesToolCall
 */
function parseCursorToolCall(parsed) {
  const toolCallObj = parsed.tool_call || {};
  // Find the key that ends with "ToolCall" or "Call"
  const key = Object.keys(toolCallObj)[0] || '';
  const toolData = toolCallObj[key] || {};
  const args = toolData.args || {};

  // Extract tool name from key (e.g., "editToolCall" -> "edit")
  const tool = key.replace(/ToolCall$/, '').replace(/Call$/, '');

  // Summarize input based on known patterns
  if (args.path) return { tool, input: args.path };
  if (args.command) return { tool, input: args.command };
  if (args.file_path) return { tool, input: args.file_path };
  if (args.pattern) return { tool, input: args.pattern };
  return { tool, input: JSON.stringify(args).slice(0, 150) };
}

/**
 * Parse Codex item-based JSON format.
 */
function parseCodexLog(lines) {
  const events = [];

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === 'item.completed') {
      const item = parsed.item;
      if (!item) continue;

      if (item.type === 'command_execution') {
        const cmd = (item.command || '').replace(/^\/bin\/\w+\s+-\w+\s+/, '');
        events.push({
          type: 'tool_call',
          tool: 'shell',
          id: item.id,
          input: cmd,
        });
      } else if (item.type === 'agent_message' && item.text) {
        events.push({ type: 'assistant_text', text: item.text });
      } else if (item.type === 'reasoning' && item.text) {
        events.push({ type: 'assistant_text', text: item.text });
      }
    } else if (parsed.type === 'turn.completed') {
      events.push({
        type: 'result',
        subtype: 'success',
        cost: undefined,
        duration: undefined,
        turns: undefined,
      });
    }
  }

  return events;
}

/**
 * Format parsed events into a readable text summary.
 */
export function formatAgentSummary(events) {
  const lines = [];
  let step = 0;

  for (const e of events) {
    if (e.type === 'assistant_text') {
      step++;
      lines.push(`\n## Step ${step}: Agent message`);
      // Truncate long messages
      const text = e.text.length > 500 ? e.text.slice(0, 500) + '...' : e.text;
      lines.push(text);
    } else if (e.type === 'tool_call') {
      lines.push(`  -> ${e.tool}: ${e.input}`);
    } else if (e.type === 'subagent_completed') {
      lines.push(`  <- subagent completed`);
    } else if (e.type === 'result') {
      lines.push(`\n## Result: ${e.subtype}`);
      if (e.cost) lines.push(`  Cost: $${e.cost.toFixed(4)}`);
      if (e.duration) lines.push(`  Duration: ${(e.duration / 1000).toFixed(1)}s`);
      if (e.turns) lines.push(`  Turns: ${e.turns}`);
    }
  }

  return lines.join('\n');
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    console.error('Usage: node scripts/parse-agent-log.js <output.jsonl> [output.txt]');
    process.exit(1);
  }

  const content = await fs.readFile(path.resolve(inputPath), 'utf-8');
  const events = parseAgentLog(content);
  const summary = formatAgentSummary(events);

  if (outputPath) {
    await fs.writeFile(path.resolve(outputPath), summary, 'utf-8');
    console.log(`Written to ${outputPath}`);
  } else {
    console.log(summary);
  }
}
