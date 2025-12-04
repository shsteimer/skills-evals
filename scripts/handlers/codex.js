import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Run a task using the Codex CLI agent
 * @param {Object} task - The enriched task object
 */
export default async function runCodex(task) {
  return new Promise((resolve, reject) => {
    const codex = spawn('codex', [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json'
    ], {
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

