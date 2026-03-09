import fs from 'fs/promises';
import path from 'path';

/**
 * Parse output.jsonl into a structured summary of what the agent did.
 *
 * Extracts: assistant messages (thinking + text), tool calls (name + input summary),
 * tool results (truncated), and key events (subagent launches, errors).
 *
 * Returns a structured object and optionally writes a readable text summary.
 */
export function parseAgentLog(jsonlContent) {
  const lines = jsonlContent.trim().split('\n').filter(Boolean);
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
          const input = block.input || {};
          // Summarize tool input — keep it short
          let inputSummary;
          if (block.name === 'Bash') {
            inputSummary = input.command || '';
          } else if (block.name === 'Read') {
            inputSummary = input.file_path || '';
          } else if (block.name === 'Write') {
            inputSummary = input.file_path || '';
          } else if (block.name === 'Edit') {
            inputSummary = input.file_path || '';
          } else if (block.name === 'Grep') {
            inputSummary = `pattern="${input.pattern || ''}" path="${input.path || '.'}"`;
          } else if (block.name === 'Glob') {
            inputSummary = input.pattern || '';
          } else if (block.name === 'Agent') {
            inputSummary = input.description || input.prompt?.slice(0, 100) || '';
          } else {
            inputSummary = JSON.stringify(input).slice(0, 150);
          }
          events.push({
            type: 'tool_call',
            tool: block.name,
            id: block.id,
            input: inputSummary
          });
        }
      }
    } else if (parsed.type === 'result') {
      events.push({
        type: 'result',
        subtype: parsed.subtype,
        cost: parsed.cost_usd,
        duration: parsed.duration_ms,
        turns: parsed.num_turns
      });
    } else if (parsed.type === 'system' && parsed.subtype === 'task_completed') {
      events.push({
        type: 'subagent_completed',
        taskId: parsed.task_id
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
