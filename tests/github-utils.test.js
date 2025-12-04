import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseGitHubUrl, downloadFromGitHub } from '../scripts/utils/github-utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock git-utils
vi.mock('../scripts/utils/git-utils.js', () => ({
  cloneRepository: vi.fn()
}));

// Mock fs-utils
vi.mock('../scripts/utils/fs-utils.js', () => ({
  copyDirectoryRecursive: vi.fn(),
  cleanupDir: vi.fn()
}));

import { cloneRepository } from '../scripts/utils/git-utils.js';
import { copyDirectoryRecursive, cleanupDir } from '../scripts/utils/fs-utils.js';

describe('github-utils', () => {
  describe('parseGitHubUrl', () => {
    describe('regular GitHub URLs', () => {
      it('should parse blob URL (file)', () => {
        const url = 'https://github.com/owner/repo/blob/main/path/to/file.txt';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('main');
        expect(result.itemPath).toBe('path/to/file.txt');
      });

      it('should parse tree URL (folder)', () => {
        const url = 'https://github.com/owner/repo/tree/develop/src/components';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('develop');
        expect(result.itemPath).toBe('src/components');
      });

      it('should parse URL with commit hash', () => {
        const url = 'https://github.com/owner/repo/blob/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0/file.js';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0');
        expect(result.itemPath).toBe('file.js');
      });

      it('should parse URL with nested path', () => {
        const url = 'https://github.com/owner/repo/tree/main/deeply/nested/folder/structure';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('main');
        expect(result.itemPath).toBe('deeply/nested/folder/structure');
      });

      it('should parse URL with branch name containing slashes', () => {
        const url = 'https://github.com/owner/repo/tree/feature/new-feature/src';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        // Note: Parser treats first segment after tree as branch
        expect(result.branch).toBe('feature');
        expect(result.itemPath).toBe('new-feature/src');
      });

      it('should handle URL with no path after branch', () => {
        const url = 'https://github.com/owner/repo/tree/main';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('main');
        expect(result.itemPath).toBe('');
      });

      it('should handle www.github.com', () => {
        const url = 'https://www.github.com/owner/repo/blob/main/file.txt';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('main');
        expect(result.itemPath).toBe('file.txt');
      });
    });

    describe('raw.githubusercontent.com URLs', () => {
      it('should parse raw file URL', () => {
        const url = 'https://raw.githubusercontent.com/owner/repo/main/path/to/file.txt';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('main');
        expect(result.itemPath).toBe('path/to/file.txt');
      });

      it('should parse raw URL with nested path', () => {
        const url = 'https://raw.githubusercontent.com/owner/repo/develop/src/utils/helper.js';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('develop');
        expect(result.itemPath).toBe('src/utils/helper.js');
      });

      it('should parse raw URL with commit hash', () => {
        const url = 'https://raw.githubusercontent.com/owner/repo/abc123def456/README.md';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('owner');
        expect(result.repo).toBe('repo');
        expect(result.branch).toBe('abc123def456');
        expect(result.itemPath).toBe('README.md');
      });
    });

    describe('error cases', () => {
      it('should throw error for unsupported URL format', () => {
        const url = 'https://github.com/owner/repo/pull/123';
        
        expect(() => parseGitHubUrl(url)).toThrow('Unsupported GitHub URL format');
      });

      it('should throw error for invalid GitHub URL', () => {
        const url = 'https://gitlab.com/owner/repo/blob/main/file.txt';
        
        expect(() => parseGitHubUrl(url)).toThrow('Invalid GitHub URL');
      });

      it('should throw error for non-GitHub domain', () => {
        const url = 'https://example.com/owner/repo';
        
        expect(() => parseGitHubUrl(url)).toThrow('Invalid GitHub URL');
      });

      it('should throw error for malformed URL', () => {
        const url = 'not-a-url';
        
        expect(() => parseGitHubUrl(url)).toThrow();
      });
    });

    describe('edge cases', () => {
      it('should handle org/repo names with hyphens and underscores', () => {
        const url = 'https://github.com/my-org_name/my-repo_name/blob/main/file.txt';
        const result = parseGitHubUrl(url);

        expect(result.org).toBe('my-org_name');
        expect(result.repo).toBe('my-repo_name');
      });

      it('should handle file with multiple dots', () => {
        const url = 'https://github.com/owner/repo/blob/main/file.test.spec.js';
        const result = parseGitHubUrl(url);

        expect(result.itemPath).toBe('file.test.spec.js');
      });

      it('should handle path with spaces encoded', () => {
        const url = 'https://github.com/owner/repo/blob/main/path%20with%20spaces/file.txt';
        const result = parseGitHubUrl(url);

        // URL parsing doesn't decode, returns encoded path
        expect(result.itemPath).toBe('path%20with%20spaces/file.txt');
      });
    });
  });

  describe('downloadFromGitHub', () => {
    const fixturesDir = path.join(__dirname, 'fixtures', 'github-downloads');

    beforeEach(async () => {
      await fs.mkdir(fixturesDir, { recursive: true });
      vi.clearAllMocks();
    });

    afterEach(async () => {
      await fs.rm(fixturesDir, { recursive: true, force: true });
    });

    it('should clone repository and copy directory', async () => {
      const source = 'https://github.com/owner/repo/tree/main/src';
      const destPath = path.join(fixturesDir, 'destination');

      // Create mock cloned directory structure
      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => true
      });

      await downloadFromGitHub(source, destPath, 'merge');

      expect(cloneRepository).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        expect.stringContaining('gh-aug-'),
        { branch: 'main', isCommitHash: false }
      );
      expect(copyDirectoryRecursive).toHaveBeenCalled();
      expect(cleanupDir).toHaveBeenCalled();
    });

    it('should detect commit hash and clone accordingly', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const source = `https://github.com/owner/repo/blob/${commitHash}/file.txt`;
      const destPath = path.join(fixturesDir, 'file.txt');

      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => false
      });
      vi.spyOn(fs, 'mkdir').mockResolvedValue();
      vi.spyOn(fs, 'copyFile').mockResolvedValue();

      await downloadFromGitHub(source, destPath);

      expect(cloneRepository).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        expect.any(String),
        { branch: commitHash, isCommitHash: true }
      );
    });

    it('should copy single file when itemPath is a file', async () => {
      const source = 'https://github.com/owner/repo/blob/main/README.md';
      const destPath = path.join(fixturesDir, 'README.md');

      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => false
      });
      vi.spyOn(fs, 'mkdir').mockResolvedValue();
      vi.spyOn(fs, 'copyFile').mockResolvedValue();

      await downloadFromGitHub(source, destPath);

      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(destPath), { recursive: true });
      expect(fs.copyFile).toHaveBeenCalled();
      expect(cleanupDir).toHaveBeenCalled();
    });

    it('should handle replace mode by cleaning up destination first', async () => {
      const source = 'https://github.com/owner/repo/tree/main/src';
      const destPath = path.join(fixturesDir, 'destination');

      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => true
      });

      await downloadFromGitHub(source, destPath, 'replace');

      expect(cleanupDir).toHaveBeenCalledWith(destPath);
      expect(copyDirectoryRecursive).toHaveBeenCalled();
    });

    it('should throw error if clone fails', async () => {
      const source = 'https://github.com/owner/repo/tree/main/src';
      const destPath = path.join(fixturesDir, 'destination');

      cloneRepository.mockImplementation(() => {
        throw new Error('Clone failed');
      });

      await expect(downloadFromGitHub(source, destPath)).rejects.toThrow(
        /Failed to clone repository/
      );
    });

    it('should throw error if path does not exist in repository', async () => {
      const source = 'https://github.com/owner/repo/tree/main/nonexistent';
      const destPath = path.join(fixturesDir, 'destination');

      // Mock successful clone but missing path
      cloneRepository.mockImplementation(() => {});
      vi.spyOn(fs, 'stat').mockRejectedValue(new Error('ENOENT'));

      await expect(downloadFromGitHub(source, destPath)).rejects.toThrow(
        /Path 'nonexistent' not found in repository/
      );
    });

    it('should always clean up temp directory even on error', async () => {
      const source = 'https://github.com/owner/repo/tree/main/src';
      const destPath = path.join(fixturesDir, 'destination');

      vi.spyOn(fs, 'stat').mockRejectedValue(new Error('Path not found'));

      await expect(downloadFromGitHub(source, destPath)).rejects.toThrow();

      expect(cleanupDir).toHaveBeenCalled();
    });

    it('should handle raw.githubusercontent.com URLs', async () => {
      const source = 'https://raw.githubusercontent.com/owner/repo/main/file.txt';
      const destPath = path.join(fixturesDir, 'file.txt');

      cloneRepository.mockImplementation(() => {});
      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => false
      });
      vi.spyOn(fs, 'mkdir').mockResolvedValue();
      vi.spyOn(fs, 'copyFile').mockResolvedValue();

      await downloadFromGitHub(source, destPath);

      expect(cloneRepository).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        expect.any(String),
        { branch: 'main', isCommitHash: false }
      );
    });

    it('should handle merge mode by not cleaning destination', async () => {
      const source = 'https://github.com/owner/repo/tree/main/src';
      const destPath = path.join(fixturesDir, 'destination');

      cloneRepository.mockImplementation(() => {});
      vi.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => true
      });

      await downloadFromGitHub(source, destPath, 'merge');

      // cleanupDir should only be called once for temp directory, not for destination
      expect(cleanupDir).toHaveBeenCalledTimes(1);
      expect(cleanupDir).not.toHaveBeenCalledWith(destPath);
    });
  });
});

