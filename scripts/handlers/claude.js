import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';

/**
 * Run a task using the Claude CLI agent
 * @param {Object} task - The enriched task object
 */
export default async function runClaude(task) {
  return new Promise((resolve, reject) => {
    const config = getAgentConfig('claude');
    
    // Build arguments array
    const args = [
      '--verbose',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions'
    ];
    
    // Add model if specified
    if (config.model) {
      args.push('--model', config.model);
    }
    
    // Add any additional arguments
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
          // Save output to task info folder
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

