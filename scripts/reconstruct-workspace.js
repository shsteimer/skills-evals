import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { addAndCommit } from './utils/git-utils.js';
import { ensureDir, cleanupDir } from './utils/fs-utils.js';
import { execAsync } from './utils/process-utils.js';
import { bootstrapWorkspace, loadScriptedAugmentation } from './utils/workspace-setup.js';

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

  const projectRoot = path.join(__dirname, '..');
  const { startFrom, augmentations, scriptedAugmentations } = taskJson;

  if (!startFrom) {
    throw new Error(`task.json in ${resultFolder} is missing startFrom`);
  }

  // Load scripted augmentations from saved paths
  const loadedScripted = [];
  for (const s of (scriptedAugmentations || [])) {
    if (!s.path) continue;
    try {
      const loaded = await loadScriptedAugmentation(s);
      loadedScripted.push(loaded);
    } catch {
      // Scripted augmentation not available — skip
    }
  }

  // Create workspace in project-local directory (so subagents have permission to read it)
  const folderName = path.basename(resultFolder);
  const batchId = taskJson.runSetId || taskJson.timestamp || path.basename(path.dirname(resultFolder));
  const workspaceDir = path.join(projectRoot, '.eval-workspaces', batchId, folderName);
  await cleanupDir(workspaceDir);
  await ensureDir(workspaceDir);

  try {
    await bootstrapWorkspace({
      ...taskJson,
      augmentations,
      scriptedAugmentations: loadedScripted,
      taskPath: path.join(projectRoot, 'tasks', taskJson.name),
      workspaceDir
    });
  } catch (error) {
    throw new Error(`Failed to reconstruct workspace for ${startFrom}: ${error.message}`);
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
