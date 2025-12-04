import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { cloneRepository } from './git-utils.js';
import { copyDirectoryRecursive, cleanupDir } from './fs-utils.js';

export function parseGitHubUrl(urlString) {
  const url = new URL(urlString);
  const pathParts = url.pathname.split('/').filter(p => p);
  
  let org, repo, branch, itemPath;
  
  if (url.hostname === 'raw.githubusercontent.com') {
    // Raw file URL: raw.githubusercontent.com/org/repo/branch/path/to/file
    org = pathParts[0];
    repo = pathParts[1];
    branch = pathParts[2];
    itemPath = pathParts.slice(3).join('/');
  } else if (url.hostname.includes('github.com')) {
    // Regular GitHub URL
    org = pathParts[0];
    repo = pathParts[1];
    
    if (pathParts[2] === 'tree') {
      // Folder: github.com/org/repo/tree/branch/path/to/folder
      branch = pathParts[3];
      itemPath = pathParts.slice(4).join('/');
    } else if (pathParts[2] === 'blob') {
      // File: github.com/org/repo/blob/branch/path/to/file
      branch = pathParts[3];
      itemPath = pathParts.slice(4).join('/');
    } else {
      throw new Error(`Unsupported GitHub URL format: ${urlString}`);
    }
  } else {
    throw new Error(`Invalid GitHub URL: ${urlString}`);
  }
  
  return { org, repo, branch, itemPath };
}

export async function downloadFromGitHub(source, destPath, mode = 'merge') {
  // Parse GitHub URL to extract org, repo, branch/commit, and path
  // Supports:
  //   - https://github.com/org/repo/blob/branch/path/to/file.txt (file)
  //   - https://github.com/org/repo/blob/commit-hash/path/to/file.txt (file at specific commit)
  //   - https://github.com/org/repo/tree/branch/path/to/folder (folder)
  //   - https://raw.githubusercontent.com/org/repo/branch/path/to/file.txt (raw file)
  
  // Strategy: Clone repo to temp folder, copy what we need, delete temp folder
  // This uses user's existing git credentials and has no rate limits
  
  const { org, repo, branch, itemPath } = parseGitHubUrl(source);
  
  // Clone repo to temp directory
  const tempDir = path.join(os.tmpdir(), `gh-aug-${Date.now()}`);
  const cloneUrl = `https://github.com/${org}/${repo}.git`;
  
  try {
    try {
      // Check if branch looks like a commit hash (40 character hex string)
      const isCommitHash = /^[0-9a-f]{40}$/i.test(branch);
      
      cloneRepository(cloneUrl, tempDir, { branch, isCommitHash });
    } catch (error) {
      const refType = /^[0-9a-f]{40}$/i.test(branch) ? 'commit' : 'branch';
      throw new Error(
        `Failed to clone repository for augmentation from ${source}.\n` +
        `Make sure the repository exists, you have access, and the ${refType} '${branch}' exists.\n` +
        `Error: ${error.message}`
      );
    }
    
    // Source path within the cloned repo
    const sourcePath = path.join(tempDir, itemPath);
    
    // Check if source exists
    let stats;
    try {
      stats = await fs.stat(sourcePath);
    } catch (error) {
      throw new Error(
        `Path '${itemPath}' not found in repository ${org}/${repo} on branch '${branch}'.\n` +
        `Make sure the path exists in the repository.`
      );
    }
    
    if (stats.isDirectory()) {
      // Handle replace mode for directories
      if (mode === 'replace') {
        await cleanupDir(destPath);
      }
      
      // Copy directory recursively
      await copyDirectoryRecursive(sourcePath, destPath);
    } else {
      // Handle single file
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(sourcePath, destPath);
    }
  } finally {
    // Clean up temp directory
    await cleanupDir(tempDir);
  }
}




