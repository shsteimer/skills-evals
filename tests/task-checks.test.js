import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runTaskChecks } from '../scripts/utils/task-checks.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'task-checks');

describe('runTaskChecks', () => {
  beforeEach(async () => {
    await fs.mkdir(fixturesDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  it('should return null when no checks.js exists', async () => {
    const taskPath = path.join(fixturesDir, 'no-checks-task');
    await fs.mkdir(taskPath, { recursive: true });

    const result = await runTaskChecks(taskPath, '/tmp/fake-workspace');
    expect(result).toBeNull();
  });

  it('should run checks.js and return parsed JSON results', async () => {
    const taskPath = path.join(fixturesDir, 'with-checks-task');
    await fs.mkdir(taskPath, { recursive: true });

    // Create a checks.js that outputs valid JSON
    const checksScript = `
const workspacePath = process.argv[2];
const results = [
  {
    "name": "file-exists",
    "description": "Expected file exists",
    "passed": true,
    "evidence": "Found file at " + workspacePath + "/test.js"
  }
];
console.log(JSON.stringify(results));
`;
    await fs.writeFile(path.join(taskPath, 'checks.js'), checksScript, 'utf-8');

    const result = await runTaskChecks(taskPath, '/tmp/fake-workspace');
    expect(result).toEqual([
      {
        name: 'file-exists',
        description: 'Expected file exists',
        passed: true,
        evidence: 'Found file at /tmp/fake-workspace/test.js'
      }
    ]);
  });

  it('should return error result when checks.js fails', async () => {
    const taskPath = path.join(fixturesDir, 'failing-checks-task');
    await fs.mkdir(taskPath, { recursive: true });

    const checksScript = `process.exit(1);`;
    await fs.writeFile(path.join(taskPath, 'checks.js'), checksScript, 'utf-8');

    const result = await runTaskChecks(taskPath, '/tmp/fake-workspace');
    expect(result).toEqual([
      expect.objectContaining({
        name: 'checks-script-error',
        passed: false
      })
    ]);
  });

  it('should return error result when checks.js outputs invalid JSON', async () => {
    const taskPath = path.join(fixturesDir, 'bad-json-task');
    await fs.mkdir(taskPath, { recursive: true });

    const checksScript = `console.log("not json");`;
    await fs.writeFile(path.join(taskPath, 'checks.js'), checksScript, 'utf-8');

    const result = await runTaskChecks(taskPath, '/tmp/fake-workspace');
    expect(result).toEqual([
      expect.objectContaining({
        name: 'checks-script-error',
        passed: false
      })
    ]);
  });

  it('should pass workspace path as first argument to checks.js', async () => {
    const taskPath = path.join(fixturesDir, 'echo-workspace-task');
    await fs.mkdir(taskPath, { recursive: true });

    const checksScript = `
const ws = process.argv[2];
console.log(JSON.stringify([{
  "name": "workspace-check",
  "description": "Received workspace path",
  "passed": ws === "/tmp/my-workspace",
  "evidence": "Got: " + ws
}]));
`;
    await fs.writeFile(path.join(taskPath, 'checks.js'), checksScript, 'utf-8');

    const result = await runTaskChecks(taskPath, '/tmp/my-workspace');
    expect(result[0].passed).toBe(true);
  });
});
