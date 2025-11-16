import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Install dependencies in the worktree
 */
export async function installDependencies(worktreePath) {
  console.log('  Installing dependencies...');

  try {
    // Check if package.json exists
    const packageJsonPath = join(worktreePath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      console.log('  No package.json found, skipping npm install');
      return;
    }

    // Run npm ci (clean install from lock file, doesn't modify package-lock.json)
    execSync('npm ci --silent', {
      cwd: worktreePath,
      shell: '/bin/bash',
      stdio: 'pipe',
    });
    console.log('  ✓ Dependencies installed');
  } catch (error) {
    console.warn(`  Warning: npm install failed: ${error.message}`);
    // Don't fail the entire test run if npm install fails
  }
}
