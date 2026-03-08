import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Integration tests verifying that orphaned child processes
 * (like dev servers) are cleaned up after the agent exits.
 *
 * The claude CLI spawns Bash tool subprocesses in their own process
 * groups, so they survive when the parent claude process is killed.
 * We clean them up by finding processes with files open in the
 * workspace directory via lsof.
 */
describe('Orphaned process cleanup', () => {
  let workspaceDir;

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-test-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('should find and kill processes with files open in workspace', async () => {
    // Start a background process that opens a file in the workspace
    const testFile = path.join(workspaceDir, 'test.log');
    fs.writeFileSync(testFile, 'test');

    // tail -f holds the file open, simulating aem up with files open in workspace
    const orphan = spawn('tail', ['-f', testFile], {
      stdio: 'ignore',
      detached: true,
    });
    orphan.unref();

    // Give it a moment to open the file
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(isProcessAlive(orphan.pid)).toBe(true);

    // Use lsof to find and kill processes in the workspace (same approach as handler)
    const output = execSync(
      `lsof +d "${workspaceDir}" -t 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    const pids = output.split('\n').map(p => parseInt(p, 10)).filter(p => p > 0);
    expect(pids).toContain(orphan.pid);

    // Kill them
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(isProcessAlive(orphan.pid)).toBe(false);
  });

  it('should not fail when no processes are found', () => {
    // Empty workspace — lsof should find nothing
    const output = execSync(
      `lsof +d "${workspaceDir}" -t 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    expect(output).toBe('');
  });
});

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
