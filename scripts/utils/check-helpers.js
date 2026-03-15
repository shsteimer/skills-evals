import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Safely read a file, returning empty string if it doesn't exist.
 */
export async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Check if a path exists.
 */
export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List directories inside a parent directory, optionally filtered.
 */
export async function listDirs(parentDir, filter) {
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    return filter ? dirs.filter(filter) : dirs;
  } catch {
    return [];
  }
}

/**
 * List files in a directory matching an extension.
 */
export async function listFiles(dir, ext) {
  try {
    const entries = await fs.readdir(dir);
    return ext ? entries.filter((f) => f.endsWith(ext)) : entries;
  } catch {
    return [];
  }
}

/**
 * Run `npm run lint` in a workspace and return a check result.
 */
export async function checkLint(ws) {
  try {
    // Check if lint script exists first
    const pkgPath = path.join(ws, 'package.json');
    const pkgContent = await readFile(pkgPath);
    if (!pkgContent) {
      return {
        name: 'lint-passes',
        description: 'npm run lint passes cleanly',
        passed: true,
        evidence: 'No package.json found — lint not applicable',
      };
    }
    const pkg = JSON.parse(pkgContent);
    if (!pkg.scripts?.lint) {
      return {
        name: 'lint-passes',
        description: 'npm run lint passes cleanly',
        passed: true,
        evidence: 'No lint script in package.json — lint not applicable',
      };
    }
    await execFileAsync('npm', ['run', 'lint'], { cwd: ws });
    return {
      name: 'lint-passes',
      description: 'npm run lint passes cleanly',
      passed: true,
      evidence: 'Lint exited with code 0',
    };
  } catch (e) {
    return {
      name: 'lint-passes',
      description: 'npm run lint passes cleanly',
      passed: false,
      evidence: `Lint failed: ${e.stderr?.toString().slice(0, 200) || e.message}`,
    };
  }
}

/**
 * Dynamically import a JS module and inspect its exports.
 * Returns { defaultExport, namedExports } or null if import fails.
 */
export async function inspectModule(modulePath) {
  try {
    const mod = await import(modulePath);
    return {
      defaultExport: mod.default,
      namedExports: Object.keys(mod).filter((k) => k !== 'default'),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Build a check result object.
 */
export function check(name, description, passed, evidence) {
  return { name, description, passed, evidence };
}
