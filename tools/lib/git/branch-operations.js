import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { sanitizeTestName } from '../utils/sanitize.js';

const execAsync = promisify(exec);

/**
 * Create a branch for this test run
 */
export async function createTestBranch(test) {
  // Generate a short unique ID (last 6 chars of timestamp-based)
  const uniqueId = Date.now().toString(36).slice(-6);

  // Simple, realistic branch name like: quote-block-a1b2c3
  const testBaseName = sanitizeTestName(test.name).substring(0, 30);
  const branchName = `${testBaseName}-${uniqueId}`;

  const initialState = test.initial_state || 'main';

  console.log(`  Creating branch: ${branchName} from ${initialState}`);

  try {
    // Create the branch
    await execAsync(`git branch ${branchName} ${initialState}`);

    return branchName;
  } catch (error) {
    throw new Error(`Failed to create branch: ${error.message}`);
  }
}

/**
 * Create worktree for task execution
 */
export async function createWorktree(branchName) {
  // Worktrees must be outside the repository's working tree
  // Use temp directory or parent directory
  const worktreeBase = process.env.TMPDIR || '/tmp';
  const worktreePath = join(worktreeBase, 'skills-eval-worktrees', branchName);

  console.log(`  Creating worktree: ${worktreePath}`);

  // Ensure parent directory exists
  mkdirSync(dirname(worktreePath), { recursive: true });

  try {
    await execAsync(`git worktree add "${worktreePath}" ${branchName}`);
    return worktreePath;
  } catch (error) {
    throw new Error(`Failed to create worktree: ${error.message}`);
  }
}

/**
 * Cleanup worktree after test
 */
export async function cleanupWorktree(worktreePath, branchName) {
  console.log('  Cleaning up worktree and branch');

  try {
    await execAsync(`git worktree remove "${worktreePath}" --force`);
    await execAsync(`git branch -D ${branchName}`);
  } catch (error) {
    console.warn(`Warning: Cleanup failed: ${error.message}`);
  }
}
