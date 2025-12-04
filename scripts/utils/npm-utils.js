import fs from 'fs/promises';
import path from 'path';
import { execAsync } from './process-utils.js';

export async function hasNpmScript(workspaceDir, scriptName) {
  const packageJsonPath = path.join(workspaceDir, 'package.json');
  
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    return Boolean(packageJson.scripts && packageJson.scripts[scriptName]);
  } catch (error) {
    // package.json doesn't exist or can't be read
    return false;
  }
}

export async function runNpmScript(workspaceDir, scriptName) {
  try {
    const { stdout, stderr } = await execAsync(`npm run ${scriptName}`, {
      cwd: workspaceDir
    });
    return {
      success: true,
      exitCode: 0,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      success: false,
      exitCode: error.code || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message
    };
  }
}



