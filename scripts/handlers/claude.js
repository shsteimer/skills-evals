import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadDisallowedTools() {
  const configPath = path.join(__dirname, '..', '..', 'config', 'disallowed-tools.json');
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Run a task using the Claude CLI agent
 * @param {Object} task - The enriched task object
 */
export default async function runClaude(task) {
  const config = getAgentConfig('claude');
  const disallowedTools = await loadDisallowedTools();

  return new Promise((resolve, reject) => {

    const args = [
      '--verbose',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      // Isolate from user's personal settings (~/.claude/CLAUDE.md, ~/.claude/settings.json)
      '--setting-sources', 'project',
    ];

    if (disallowedTools.length > 0) {
      args.push('--disallowedTools', ...disallowedTools);
    }

    if (config.model) {
      args.push('--model', config.model);
    }

    const additionalArgs = parseAdditionalArgs(config.additionalArgs);
    args.push(...additionalArgs);

    const claude = spawn('claude', args, {
      cwd: task.workspaceDir,
      stdio: ['pipe', 'pipe', 'inherit']
    });

    // Write prompt to stdin
    claude.stdin.write(task.prompt);
    claude.stdin.end();

    // Capture stdout (JSON output)
    let outputData = '';
    claude.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputData += chunk;
    });

    claude.on('error', (error) => {
      reject(new Error(`Failed to spawn claude CLI: ${error.message}`));
    });

    claude.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}`));
      } else {
        try {
          const outputPath = path.join(task.taskInfoFolder, 'output.jsonl');
          await fs.writeFile(outputPath, outputData, 'utf-8');
          resolve();
        } catch (error) {
          reject(new Error(`Failed to save output: ${error.message}`));
        }
      }
    });
  });
}
