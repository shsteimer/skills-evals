import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readFile, exists, listDirs, listFiles, checkLint, inspectModule, check } from '../scripts/utils/check-helpers.js';

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-helpers-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('readFile', () => {
  it('should read an existing file', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'hello');
    const content = await readFile(path.join(tempDir, 'test.txt'));
    expect(content).toBe('hello');
  });

  it('should return empty string for missing file', async () => {
    const content = await readFile(path.join(tempDir, 'missing.txt'));
    expect(content).toBe('');
  });
});

describe('exists', () => {
  it('should return true for existing path', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), '');
    expect(await exists(path.join(tempDir, 'test.txt'))).toBe(true);
  });

  it('should return false for missing path', async () => {
    expect(await exists(path.join(tempDir, 'nope'))).toBe(false);
  });
});

describe('listDirs', () => {
  it('should list directories', async () => {
    await fs.mkdir(path.join(tempDir, 'dir-a'));
    await fs.mkdir(path.join(tempDir, 'dir-b'));
    await fs.writeFile(path.join(tempDir, 'file.txt'), '');
    const dirs = await listDirs(tempDir);
    expect(dirs).toContain('dir-a');
    expect(dirs).toContain('dir-b');
    expect(dirs).not.toContain('file.txt');
  });

  it('should apply filter', async () => {
    await fs.mkdir(path.join(tempDir, 'keep'));
    await fs.mkdir(path.join(tempDir, 'skip'));
    const dirs = await listDirs(tempDir, (d) => d !== 'skip');
    expect(dirs).toEqual(['keep']);
  });

  it('should return empty array for missing directory', async () => {
    const dirs = await listDirs(path.join(tempDir, 'nope'));
    expect(dirs).toEqual([]);
  });
});

describe('listFiles', () => {
  it('should list files with extension filter', async () => {
    await fs.writeFile(path.join(tempDir, 'a.html'), '');
    await fs.writeFile(path.join(tempDir, 'b.html'), '');
    await fs.writeFile(path.join(tempDir, 'c.txt'), '');
    const files = await listFiles(tempDir, '.html');
    expect(files).toContain('a.html');
    expect(files).toContain('b.html');
    expect(files).not.toContain('c.txt');
  });

  it('should return empty array for missing directory', async () => {
    const files = await listFiles(path.join(tempDir, 'nope'), '.html');
    expect(files).toEqual([]);
  });
});

describe('checkLint', () => {
  it('should pass when no package.json exists', async () => {
    const result = await checkLint(tempDir);
    expect(result.name).toBe('lint-passes');
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('No package.json');
  });

  it('should pass when no lint script in package.json', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ scripts: {} }));
    const result = await checkLint(tempDir);
    expect(result.passed).toBe(true);
    expect(result.evidence).toContain('No lint script');
  });
});

describe('inspectModule', () => {
  it('should detect a default function export', async () => {
    const modPath = path.join(tempDir, 'mod.mjs');
    await fs.writeFile(modPath, 'export default function decorate(el) { return el; }');
    const result = await inspectModule(`file://${modPath}`);
    expect(result.defaultExport).toBeTypeOf('function');
    expect(result.defaultExport.name).toBe('decorate');
  });

  it('should detect named exports', async () => {
    const modPath = path.join(tempDir, 'mod.mjs');
    await fs.writeFile(modPath, 'export const foo = 1; export default function bar() {}');
    const result = await inspectModule(`file://${modPath}`);
    expect(result.namedExports).toContain('foo');
  });

  it('should return error for invalid module', async () => {
    const result = await inspectModule('file:///nonexistent/mod.mjs');
    expect(result.error).toBeDefined();
  });
});

describe('check', () => {
  it('should build a check result object', () => {
    const result = check('test-name', 'Test description', true, 'evidence here');
    expect(result).toEqual({
      name: 'test-name',
      description: 'Test description',
      passed: true,
      evidence: 'evidence here',
    });
  });
});
