import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Remove test artifacts from the branch (tasks/, tools/, EVALUATION_PLAN.md, etc.)
 */
export async function cleanupTestArtifacts(worktreePath) {
  console.log('  Cleaning up test artifacts from worktree');

  const artifactsToRemove = [
    'tasks',
    'tools',
    'evaluations',
    'EVALUATION_PLAN.md',
  ];

  // Check which artifacts actually exist in git
  const filesToRemove = [];
  for (const artifact of artifactsToRemove) {
    try {
      const { stdout } = await execAsync(`cd "${worktreePath}" && git ls-files ${artifact}`, {
        shell: '/bin/bash',
      });
      const files = stdout.trim().split('\n').filter((f) => f);
      if (files.length > 0) {
        filesToRemove.push(artifact);
      }
    } catch (error) {
      // Artifact doesn't exist in git, skip it
    }
  }

  if (filesToRemove.length > 0) {
    await execAsync(`cd "${worktreePath}" && git rm -rf ${filesToRemove.join(' ')}`, {
      shell: '/bin/bash',
    });
    await execAsync(`cd "${worktreePath}" && git commit -m "test: remove evaluation framework artifacts"`, {
      shell: '/bin/bash',
    });
    console.log(`  Removed: ${filesToRemove.join(', ')}`);
  } else {
    console.log('  No test artifacts to remove');
  }
}
