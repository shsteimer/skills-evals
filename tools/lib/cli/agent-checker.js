import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if agent CLI is available
 */
export async function checkAgentAvailability(agent) {
  const agentInfo = {
    'claude-code': {
      binary: 'claude',
      installUrl: 'https://claude.com/claude-code',
      installInstructions: 'Install Claude Code from https://claude.com/claude-code',
    },
    'cursor-cli': {
      binary: 'cursor-agent',
      installUrl: 'https://cursor.com/cli',
      installInstructions: 'Install Cursor CLI from https://cursor.com/cli',
    },
    'codex-cli': {
      binary: 'codex',
      installUrl: 'https://github.com/openai/codex-cli',
      installInstructions: 'Install Codex CLI - see documentation at https://github.com/openai/codex-cli',
    },
  };

  const info = agentInfo[agent];
  if (!info) {
    return { available: false, error: `Unknown agent: ${agent}` };
  }

  try {
    await execAsync(`which ${info.binary}`);
    return { available: true };
  } catch (error) {
    return {
      available: false,
      binary: info.binary,
      installInstructions: info.installInstructions,
    };
  }
}
