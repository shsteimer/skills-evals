/**
 * Generate chronological execution transcript from JSONL output
 */
export function generateExecutionTranscript(jsonlOutput, agentName) {
  const lines = jsonlOutput.trim().split('\n').filter((line) => line.trim());
  const events = [];

  // Parse each line as JSON
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch (e) {
      // Skip lines that aren't valid JSON
    }
  }

  if (events.length === 0) {
    return '';
  }

  // Use the agent name we already know
  if (agentName === 'claude-code') {
    return transcribeClaudeCode(events);
  } if (agentName === 'cursor-cli') {
    return transcribeCursor(events);
  } if (agentName === 'codex-cli') {
    return transcribeCodex(events);
  }

  return '';
}

/**
 * Transcribe Claude Code execution
 */
function transcribeClaudeCode(events) {
  let transcript = '';

  for (const event of events) {
    if (event.type === 'assistant' && event.message && event.message.content) {
      for (const item of event.message.content) {
        if (item.type === 'text' && item.text) {
          transcript += '[AGENT MESSAGE]\n';
          transcript += `${item.text}\n\n`;
        } else if (item.type === 'tool_use') {
          transcript += '[TOOL]\n';
          transcript += `[Tool: ${item.name}]\n`;
          if (item.input) {
            transcript += `${JSON.stringify(item.input, null, 2)}\n\n`;
          }
        }
      }
    } else if (event.type === 'result' && event.result) {
      transcript += '[RESULT]\n';
      transcript += `${event.result}\n\n`;
    }
  }

  return transcript;
}

/**
 * Transcribe Cursor execution
 */
function transcribeCursor(events) {
  let transcript = '';

  for (const event of events) {
    if (event.type === 'user' && event.message && event.message.content) {
      for (const item of event.message.content) {
        if (item.type === 'text' && item.text) {
          transcript += '[USER MESSAGE]\n';
          transcript += `${item.text}\n\n`;
        }
      }
    } else if (event.type === 'tool_call') {
      if (event.subtype === 'started' && event.tool_call) {
        const toolCall = event.tool_call;
        const toolName = Object.keys(toolCall)[0]?.replace('ToolCall', '') || 'unknown';
        const args = toolCall[Object.keys(toolCall)[0]]?.args || {};

        transcript += '[TOOL]\n';
        transcript += `[Tool: ${toolName}]\n`;
        transcript += `${JSON.stringify(args, null, 2)}\n\n`;
      } else if (event.subtype === 'completed' && event.tool_call) {
        // Result is nested inside tool_call structure
        const toolCall = event.tool_call;
        const toolKey = Object.keys(toolCall)[0]; // e.g., "readToolCall"
        const result = toolCall[toolKey]?.result;

        if (result) {
          transcript += '[RESULT]\n';
          transcript += `${JSON.stringify(result, null, 2)}\n\n`;
        }
      }
    } else if (event.type === 'assistant' && event.message && event.message.content) {
      for (const item of event.message.content) {
        if (item.type === 'text' && item.text) {
          transcript += '[AGENT MESSAGE]\n';
          transcript += `${item.text}\n\n`;
        }
      }
    } else if (event.type === 'result' && event.response_text) {
      transcript += '[RESULT]\n';
      transcript += `${event.response_text}\n\n`;
    }
  }

  return transcript;
}

/**
 * Transcribe Codex execution
 */
function transcribeCodex(events) {
  let transcript = '';

  for (const event of events) {
    if (event.type === 'item.completed' && event.item) {
      const { item } = event;
      if (item.type === 'reasoning' && item.text) {
        transcript += '[REASONING]\n';
        transcript += `${item.text}\n\n`;
      } else if (item.type === 'command_execution') {
        transcript += '[COMMAND]\n';
        transcript += `[Command: ${item.command}]\n`;
        if (item.aggregated_output) {
          transcript += `${item.aggregated_output}\n`;
        }
        if (item.exit_code !== undefined) {
          transcript += `Exit code: ${item.exit_code}\n\n`;
        }
      } else if (item.type === 'message' && item.text) {
        transcript += '[AGENT MESSAGE]\n';
        transcript += `${item.text}\n\n`;
      } else if (item.type === 'agent_message' && item.text) {
        transcript += '[AGENT MESSAGE]\n';
        transcript += `${item.text}\n\n`;
      }
    }
  }

  return transcript;
}
