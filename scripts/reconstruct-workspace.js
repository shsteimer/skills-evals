import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { cloneRepository, addAndCommit } from './utils/git-utils.js';
import { downloadFromGitHub } from './utils/github-utils.js';
import { copyDirectoryRecursive, ensureDir, cleanupDir } from './utils/fs-utils.js';
import { execAsync } from './utils/process-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reconstruct an agent's workspace from a result folder.
 *
 * 1. Clone the startFrom repo
 * 2. Apply augmentations
 * 3. Commit as "Workspace setup"
 * 4. Apply changes.diff
 * 5. Install npm dependencies
 *
 * Returns the workspace path.
 */
export async function reconstructWorkspace(resultFolder) {
  // Read task.json to get startFrom and augmentations
  const taskJsonPath = path.join(resultFolder, 'task.json');
  const taskJson = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8'));

  const { startFrom, augmentations } = taskJson;

  if (!startFrom) {
    throw new Error(`task.json in ${resultFolder} is missing startFrom`);
  }

  // Parse startFrom URL
  const url = new URL(startFrom);
  const pathParts = url.pathname.split('/').filter(p => p);
  const org = pathParts[0];
  const repo = pathParts[1];
  let branch = 'main';
  if (pathParts[2] === 'tree' && pathParts[3]) {
    branch = pathParts[3];
  }
  const cloneUrl = `https://github.com/${org}/${repo}.git`;

  // Create workspace in temp directory
  const folderName = path.basename(resultFolder);
  const workspaceDir = path.join(os.tmpdir(), 'skills-evals-eval', folderName);
  await cleanupDir(workspaceDir);
  await ensureDir(workspaceDir);

  // Clone repo to temp, then move contents to workspace
  const tempCloneDir = path.join(os.tmpdir(), `eval-clone-${Date.now()}`);
  try {
    cloneRepository(cloneUrl, tempCloneDir, { branch });
  } catch (error) {
    throw new Error(
      `Failed to clone ${startFrom}: ${error.message}`
    );
  }

  const entries = await fs.readdir(tempCloneDir);
  for (const entry of entries) {
    await fs.rename(
      path.join(tempCloneDir, entry),
      path.join(workspaceDir, entry)
    );
  }
  await fs.rmdir(tempCloneDir);

  // Apply augmentations
  if (augmentations && Array.isArray(augmentations)) {
    for (const aug of augmentations) {
      if (!aug.source || !aug.target) continue;

      const targetPath = path.join(workspaceDir, aug.target);
      const mode = aug.mode || 'merge';

      if (aug.source.startsWith('http://') || aug.source.startsWith('https://')) {
        if (aug.source.includes('github.com')) {
          await downloadFromGitHub(aug.source, targetPath, mode);
        } else {
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          const response = await fetch(aug.source);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${aug.source}: ${response.statusText}`);
          }
          const content = await response.text();
          await fs.writeFile(targetPath, content, 'utf-8');
        }
      } else {
        // Local path — resolve relative to project root (where augmentations/ lives)
        const projectRoot = path.join(__dirname, '..');
        let sourcePath;
        if (path.isAbsolute(aug.source)) {
          sourcePath = aug.source;
        } else {
          sourcePath = path.resolve(projectRoot, aug.source);
        }

        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          if (mode === 'replace') {
            await cleanupDir(targetPath);
          }
          await copyDirectoryRecursive(sourcePath, targetPath);
        } else {
          await ensureDir(path.dirname(targetPath));
          await fs.copyFile(sourcePath, targetPath);
        }
      }
    }
  }

  // Commit all setup
  addAndCommit(workspaceDir, 'Workspace setup');

  // Apply changes.diff from the result folder
  const diffPath = path.join(resultFolder, 'changes.diff');
  try {
    const diff = await fs.readFile(diffPath, 'utf-8');
    if (diff.trim()) {
      // Write diff to a temp file for git apply (avoids stdin issues with large diffs)
      const tempDiffPath = path.join(os.tmpdir(), `eval-diff-${Date.now()}.patch`);
      await fs.writeFile(tempDiffPath, diff, 'utf-8');
      try {
        execSync(`git apply --allow-empty "${tempDiffPath}"`, {
          cwd: workspaceDir,
          stdio: 'pipe'
        });
      } catch (applyError) {
        // Try with --reject to apply what we can
        try {
          execSync(`git apply --reject --allow-empty "${tempDiffPath}"`, {
            cwd: workspaceDir,
            stdio: 'pipe'
          });
          console.error('Warning: some hunks failed to apply (see .rej files in workspace)');
        } catch {
          console.error(`Warning: git apply failed: ${applyError.message}`);
        }
      } finally {
        await fs.unlink(tempDiffPath).catch(() => {});
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // No changes.diff — workspace is just the base setup
  }

  // Install npm dependencies
  const packageJsonPath = path.join(workspaceDir, 'package.json');
  try {
    await fs.access(packageJsonPath);
    await execAsync('npm ci', { cwd: workspaceDir });
  } catch {
    // No package.json or npm ci failed — continue
  }

  return workspaceDir;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const resultFolder = process.argv[2];

  if (!resultFolder) {
    console.error('Usage: node scripts/reconstruct-workspace.js <result-folder-path>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(resultFolder);

  try {
    const workspacePath = await reconstructWorkspace(resolvedPath);
    // Print workspace path to stdout (skill reads this)
    console.log(workspacePath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
