import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { copyDirectoryRecursive, ensureDir, cleanupDir } from './fs-utils.js';
import { cloneRepository, addWorktree } from './git-utils.js';
import { downloadFromGitHub } from './github-utils.js';
import { sanitizeName } from './string-utils.js';
import { createAskpassScript, configureGitIdentity } from './agent-launch.js';

const configDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config');

function isCommitHash(ref) {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

export function parseGitHubStartFrom(startFrom) {
  if (!startFrom) {
    throw new Error('startFrom is required');
  }

  let url;
  try {
    url = new URL(startFrom);
  } catch {
    throw new Error('startFrom must be a valid GitHub URL');
  }

  if (!url.hostname.includes('github.com')) {
    throw new Error('startFrom must be a valid GitHub URL');
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  const org = pathParts[0];
  const repo = pathParts[1];

  if (!org || !repo) {
    throw new Error('startFrom must be a valid GitHub URL');
  }

  const ref = pathParts[2] === 'tree' && pathParts[3]
    ? pathParts.slice(3).join('/')
    : 'main';

  return {
    cloneUrl: `https://github.com/${org}/${repo}.git`,
    ref,
    isCommitHash: isCommitHash(ref),
  };
}

export async function cloneStartFromIntoWorkspace(startFrom, workspaceDir) {
  const { cloneUrl, ref, isCommitHash } = parseGitHubStartFrom(startFrom);

  const tempDir = path.join(os.tmpdir(), `clone-${Date.now()}`);
  try {
    cloneRepository(cloneUrl, tempDir, { branch: ref, isCommitHash });
  } catch (error) {
    throw new Error(
      `Failed to clone repository from ${startFrom}.\n` +
      `Make sure the repository exists, you have access, and the ${isCommitHash ? 'commit' : 'branch'} '${ref}' exists.\n` +
      `Error: ${error.message}`
    );
  }

  const entries = await fs.readdir(tempDir);
  for (const entry of entries) {
    await fs.cp(
      path.join(tempDir, entry),
      path.join(workspaceDir, entry),
      { recursive: true }
    );
  }

  await fs.rm(tempDir, { recursive: true, force: true });
}

export async function copyAgentConfig(agent, workspaceDir) {
  const copies = {
    claude: [],
    cursor: [
      { src: 'cursor-system-prompt.md', dest: '.cursor/rules/system-prompt.md' },
    ],
    codex: [
      { src: 'codex-config.toml', dest: '.codex/config.toml' },
    ],
  };

  const filesToCopy = copies[agent] || [];
  for (const { src, dest } of filesToCopy) {
    const srcPath = path.join(configDir, src);
    try {
      await fs.access(srcPath);
      const destPath = path.join(workspaceDir, dest);
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(srcPath, destPath);
    } catch {
      // Config file doesn't exist — skip
    }
  }
}

async function resolveAugmentationSource(augSource, taskPath) {
  if (path.isAbsolute(augSource)) {
    return augSource;
  }

  const taskRelativePath = taskPath ? path.join(taskPath, augSource) : null;
  if (taskRelativePath) {
    try {
      await fs.access(taskRelativePath);
      return taskRelativePath;
    } catch {
      // Fall through to project cwd.
    }
  }

  return path.resolve(process.cwd(), augSource);
}

async function applyFileCopyAugmentation(workspaceDir, aug, taskPath) {
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
    return;
  }

  const sourcePath = await resolveAugmentationSource(aug.source, taskPath);
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

export async function loadScriptedAugmentation(script) {
  if (typeof script.augment === 'function') {
    return script;
  }

  if (!script.path) {
    throw new Error(`Scripted augmentation '${script.name || 'unknown'}' is missing a path`);
  }

  const resolvedPath = path.isAbsolute(script.path)
    ? script.path
    : path.resolve(process.cwd(), script.path);
  const mod = await import(pathToFileURL(resolvedPath).href);
  const loaded = mod.default;
  if (!loaded || typeof loaded.augment !== 'function') {
    throw new Error(`Scripted augmentation must export default { name, augment } (${script.path})`);
  }

  return { ...loaded, path: script.path, name: script.name || loaded.name };
}

export async function applyWorkspaceAugmentations(task) {
  if (task.augmentations && Array.isArray(task.augmentations)) {
    for (const aug of task.augmentations) {
      if (Array.isArray(aug.agents) && aug.agents.length > 0 && !aug.agents.includes(task.agent)) {
        continue;
      }
      if (aug.source && aug.target) {
        await applyFileCopyAugmentation(task.workspaceDir, aug, task.taskPath);
      }
    }
  }

  if (task.scriptedAugmentations && Array.isArray(task.scriptedAugmentations)) {
    const context = {
      workspaceDir: task.workspaceDir,
      agent: task.agent,
      taskName: task.name
    };
    for (const scriptDef of task.scriptedAugmentations) {
      const script = await loadScriptedAugmentation(scriptDef);
      await script.augment(context);
    }
  }
}

export async function createWorktreeWorkspace(startFrom, workspaceDir, branchName, cloneRegistry, clonesBaseDir) {
  const { cloneUrl, ref, isCommitHash } = parseGitHubStartFrom(startFrom);
  const parentRepoPath = await cloneRegistry.getOrCreate(cloneUrl, ref, isCommitHash, clonesBaseDir);
  addWorktree(parentRepoPath, workspaceDir, branchName);
  return parentRepoPath;
}

export async function bootstrapWorkspace(task, options = {}) {
  const { cloneRegistry, clonesBaseDir, branchName } = options;

  if (cloneRegistry && clonesBaseDir && branchName) {
    // Worktree-based workspace
    const parentRepoPath = await createWorktreeWorkspace(
      task.startFrom, task.workspaceDir, branchName, cloneRegistry, clonesBaseDir
    );
    task.parentRepoPath = parentRepoPath;
  } else {
    // Legacy clone-based workspace (used by reconstruct-workspace)
    await ensureDir(task.workspaceDir);
    await cloneStartFromIntoWorkspace(task.startFrom, task.workspaceDir);
  }

  // Set up bot auth before any git operations that might need identity
  configureGitIdentity(task.workspaceDir, execSync);
  await createAskpassScript(task.workspaceDir);

  if (options.copyAgentConfig !== false) {
    await copyAgentConfig(sanitizeName(task.agent), task.workspaceDir);
  }

  await applyWorkspaceAugmentations(task);
}
