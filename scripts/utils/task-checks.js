import path from 'path';
import fs from 'fs/promises';
import { execAsync } from './process-utils.js';

/**
 * Run a task's checks.js script against a workspace, if it exists.
 *
 * The script receives the workspace path as its first argument and is expected
 * to print a JSON array of check results to stdout.
 *
 * Returns null if no checks.js exists, or an array of check results.
 */
export async function runTaskChecks(taskPath, workspacePath) {
  const checksPath = path.join(taskPath, 'checks.js');

  try {
    await fs.access(checksPath);
  } catch {
    return null;
  }

  try {
    const { stdout } = await execAsync(
      `node "${checksPath}" "${workspacePath}"`
    );
    return JSON.parse(stdout);
  } catch (error) {
    return [
      {
        name: 'checks-script-error',
        description: 'Task checks script failed to run',
        passed: false,
        evidence: error.message
      }
    ];
  }
}
