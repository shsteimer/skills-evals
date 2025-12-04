import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasNpmScript, runNpmScript } from '../scripts/utils/npm-utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock process-utils
vi.mock('../scripts/utils/process-utils.js', () => ({
  execAsync: vi.fn()
}));

import { execAsync } from '../scripts/utils/process-utils.js';

describe('npm-utils', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'npm-utils');

  beforeEach(async () => {
    await fs.mkdir(fixturesDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  describe('hasNpmScript', () => {
    it('should return true when script exists', async () => {
      const packageJson = {
        name: 'test-package',
        scripts: {
          test: 'vitest',
          build: 'tsc'
        }
      };
      await fs.writeFile(
        path.join(fixturesDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const hasTest = await hasNpmScript(fixturesDir, 'test');
      const hasBuild = await hasNpmScript(fixturesDir, 'build');

      expect(hasTest).toBe(true);
      expect(hasBuild).toBe(true);
    });

    it('should return false when script does not exist', async () => {
      const packageJson = {
        name: 'test-package',
        scripts: {
          test: 'vitest'
        }
      };
      await fs.writeFile(
        path.join(fixturesDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = await hasNpmScript(fixturesDir, 'build');

      expect(result).toBe(false);
    });

    it('should return false when package.json has no scripts section', async () => {
      const packageJson = {
        name: 'test-package',
        version: '1.0.0'
      };
      await fs.writeFile(
        path.join(fixturesDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = await hasNpmScript(fixturesDir, 'test');

      expect(result).toBe(false);
    });

    it('should return false when package.json does not exist', async () => {
      const result = await hasNpmScript(fixturesDir, 'test');

      expect(result).toBe(false);
    });

    it('should return false when package.json is invalid JSON', async () => {
      await fs.writeFile(
        path.join(fixturesDir, 'package.json'),
        'invalid json content'
      );

      const result = await hasNpmScript(fixturesDir, 'test');

      expect(result).toBe(false);
    });

    it('should return false when scripts is null', async () => {
      const packageJson = {
        name: 'test-package',
        scripts: null
      };
      await fs.writeFile(
        path.join(fixturesDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = await hasNpmScript(fixturesDir, 'test');

      expect(result).toBe(false);
    });

    it('should handle empty script name', async () => {
      const packageJson = {
        name: 'test-package',
        scripts: {
          '': 'echo empty'
        }
      };
      await fs.writeFile(
        path.join(fixturesDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = await hasNpmScript(fixturesDir, '');

      expect(result).toBe(true);
    });
  });

  describe('runNpmScript', () => {
    it('should return success result when script succeeds', async () => {
      execAsync.mockResolvedValue({
        stdout: 'Test output',
        stderr: ''
      });

      const result = await runNpmScript(fixturesDir, 'test');

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Test output');
      expect(result.stderr).toBe('');
      expect(execAsync).toHaveBeenCalledWith('npm run test', {
        cwd: fixturesDir
      });
    });

    it('should return success result with stderr when script outputs to stderr', async () => {
      execAsync.mockResolvedValue({
        stdout: 'Output',
        stderr: 'Some warnings'
      });

      const result = await runNpmScript(fixturesDir, 'build');

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Output');
      expect(result.stderr).toBe('Some warnings');
    });

    it('should return failure result when script fails', async () => {
      const error = new Error('Command failed');
      error.code = 1;
      error.stdout = 'Some output';
      error.stderr = 'Error message';
      execAsync.mockRejectedValue(error);

      const result = await runNpmScript(fixturesDir, 'test');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('Some output');
      expect(result.stderr).toBe('Error message');
    });

    it('should handle error without code', async () => {
      const error = new Error('Command failed');
      error.stdout = 'Output';
      error.stderr = 'Error';
      execAsync.mockRejectedValue(error);

      const result = await runNpmScript(fixturesDir, 'test');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle error without stdout/stderr', async () => {
      const error = new Error('Command failed');
      execAsync.mockRejectedValue(error);

      const result = await runNpmScript(fixturesDir, 'test');

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Command failed');
    });

    it('should pass correct script name to npm', async () => {
      execAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await runNpmScript(fixturesDir, 'lint:fix');

      expect(execAsync).toHaveBeenCalledWith('npm run lint:fix', {
        cwd: fixturesDir
      });
    });

    it('should handle script with spaces in name', async () => {
      execAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await runNpmScript(fixturesDir, 'test:unit');

      expect(execAsync).toHaveBeenCalledWith('npm run test:unit', {
        cwd: fixturesDir
      });
    });
  });
});

