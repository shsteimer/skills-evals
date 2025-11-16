/**
 * Build agent command based on agent type
 */
export function buildAgentCommand(agent, taskPrompt, outputFormat = 'stream-json') {
  let agentCommand;
  let agentBinary;

  switch (agent) {
    case 'claude-code':
      agentBinary = 'claude';
      if (outputFormat === 'json') {
        agentCommand = `claude --permission-mode bypassPermissions --output-format json --print "${taskPrompt.replace(/"/g, '\\"')}"`;
      } else {
        agentCommand = `claude --permission-mode bypassPermissions --output-format stream-json --verbose --print "${taskPrompt.replace(/"/g, '\\"')}"`;
      }
      break;
    case 'cursor-cli':
      agentBinary = 'cursor-agent';
      agentCommand = `cursor-agent --force --output-format stream-json "${taskPrompt.replace(/"/g, '\\"')}"`;
      break;
    case 'codex-cli':
      agentBinary = 'codex';
      agentCommand = `codex exec --dangerously-bypass-approvals-and-sandbox --json -c 'features.web_search=true' "${taskPrompt.replace(/"/g, '\\"')}"`;
      break;
    default:
      throw new Error(`Unknown agent: ${agent}`);
  }

  return { agentCommand, agentBinary };
}
