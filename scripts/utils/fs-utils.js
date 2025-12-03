import fs from 'fs/promises';
import path from 'path';

export async function copyDirectoryRecursive(src, dest) {
  // Create destination directory
  await fs.mkdir(dest, { recursive: true });
  
  // Read all entries in source directory
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      // Copy file
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function cleanupDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

