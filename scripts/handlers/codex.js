import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getAgentConfig, parseAdditionalArgs } from '../utils/env-config.js';

/**
 * Run a task using the Codex CLI agent
 * @param {Object} task - The enriched task object
 */
export default async function runCodex(task) {
  return new Promise((resolve, reject) => {
    const config = getAgentConfig('codex');
    
    // Build arguments array
    const args = [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json'
    ];
    
    // Add model if specified
    if (config.model) {
      args.push('--model', config.model);
    }
    
    // Add any additional arguments
    const additionalArgs = parseAdditionalArgs(config.additionalArgs);
    args.push(...additionalArgs);
    
    const codex = spawn('codex', args, {
      cwd: task.workspaceDir,
      stdio: ['pipe', 'pipe', 'inherit']
    });
    
    // Write prompt to stdin
    codex.stdin.write(task.prompt);
    codex.stdin.end();
    
    // Capture stdout (JSON output)
    let outputData = '';
    codex.stdout.on('data', (data) => {
      const chunk = data.toString();
      outputData += chunk;
      // Also write to console for monitoring
      process.stdout.write(chunk);
    });
    
    codex.on('error', (error) => {
      reject(new Error(`Failed to spawn codex CLI: ${error.message}`));
    });
    
    codex.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Codex CLI exited with code ${code}`));
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

