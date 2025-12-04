import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cloneRepository,
  checkoutBranch,
  addAndCommit,
  captureGitChanges,
  captureGitCommits
} from '../scripts/utils/git-utils.js';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: vi.fn(),
    exec: vi.fn()
  };
});

// Mock process-utils
vi.mock('../scripts/utils/process-utils.js', () => ({
  execAsync: vi.fn()
}));

import { execAsync } from '../scripts/utils/process-utils.js';

describe('git-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cloneRepository', () => {
    it('should clone repository with default settings', () => {
      cloneRepository('https://github.com/owner/repo.git', '/path/to/dest');

      expect(execSync).toHaveBeenCalledWith(
        'git clone https://github.com/owner/repo.git "/path/to/dest"',
        { stdio: 'pipe' }
      );
    });

    it('should clone repository with branch using shallow clone', () => {
      cloneRepository('https://github.com/owner/repo.git', '/path/to/dest', {
        branch: 'develop'
      });

      expect(execSync).toHaveBeenCalledWith(
        'git clone --depth 1 --branch develop https://github.com/owner/repo.git "/path/to/dest"',
        { stdio: 'pipe' }
      );
    });

    it('should clone repository and checkout commit hash', () => {
      cloneRepository('https://github.com/owner/repo.git', '/path/to/dest', {
        branch: 'abc123',
        isCommitHash: true
      });

      expect(execSync).toHaveBeenCalledTimes(2);
      expect(execSync).toHaveBeenNthCalledWith(
        1,
        'git clone https://github.com/owner/repo.git "/path/to/dest"',
        { stdio: 'pipe' }
      );
      expect(execSync).toHaveBeenNthCalledWith(
        2,
        'git checkout abc123',
        { cwd: '/path/to/dest', stdio: 'pipe' }
      );
    });

    it('should handle paths with spaces', () => {
      cloneRepository('https://github.com/owner/repo.git', '/path with spaces/dest');

      expect(execSync).toHaveBeenCalledWith(
        'git clone https://github.com/owner/repo.git "/path with spaces/dest"',
        { stdio: 'pipe' }
      );
    });

    it('should clone with branch containing slashes', () => {
      cloneRepository('https://github.com/owner/repo.git', '/path/to/dest', {
        branch: 'feature/new-feature'
      });

      expect(execSync).toHaveBeenCalledWith(
        'git clone --depth 1 --branch feature/new-feature https://github.com/owner/repo.git "/path/to/dest"',
        { stdio: 'pipe' }
      );
    });

    it('should not use --depth for commit hashes', () => {
      cloneRepository('https://github.com/owner/repo.git', '/path/to/dest', {
        branch: 'a1b2c3d4e5f6789012345678901234567890abcd',
        isCommitHash: true
      });

      const cloneCall = execSync.mock.calls[0][0];
      expect(cloneCall).not.toContain('--depth');
    });
  });

  describe('checkoutBranch', () => {
    it('should checkout existing branch', () => {
      checkoutBranch('/workspace', 'main');

      expect(execSync).toHaveBeenCalledWith('git checkout main', {
        cwd: '/workspace'
      });
    });

    it('should create and checkout new branch', () => {
      checkoutBranch('/workspace', 'new-feature', true);

      expect(execSync).toHaveBeenCalledWith('git checkout -b new-feature', {
        cwd: '/workspace'
      });
    });

    it('should handle branch names with special characters', () => {
      checkoutBranch('/workspace', 'feature/test-123');

      expect(execSync).toHaveBeenCalledWith('git checkout feature/test-123', {
        cwd: '/workspace'
      });
    });

    it('should use correct working directory', () => {
      checkoutBranch('/custom/workspace', 'develop');

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: '/custom/workspace' })
      );
    });
  });

  describe('addAndCommit', () => {
    it('should stage and commit changes', () => {
      addAndCommit('/workspace', 'Initial commit');

      expect(execSync).toHaveBeenCalledTimes(2);
      expect(execSync).toHaveBeenNthCalledWith(1, 'git add .', {
        cwd: '/workspace'
      });
      expect(execSync).toHaveBeenNthCalledWith(2, 'git commit -m "Initial commit"', {
        cwd: '/workspace'
      });
    });

    it('should handle commit messages with special characters', () => {
      addAndCommit('/workspace', 'feat: add new feature');

      expect(execSync).toHaveBeenNthCalledWith(2, 'git commit -m "feat: add new feature"', {
        cwd: '/workspace'
      });
    });

    it('should not throw error when nothing to commit', () => {
      execSync.mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new Error('nothing to commit');
        });

      expect(() => addAndCommit('/workspace', 'Test')).not.toThrow();
    });

    it('should use correct working directory', () => {
      addAndCommit('/custom/workspace', 'Test commit');

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: '/custom/workspace' })
      );
    });
  });

  describe('captureGitChanges', () => {
    it('should capture diff from base commit to current', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // git log
        .mockResolvedValueOnce({ stdout: 'diff content', stderr: '' }) // git diff base..HEAD
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git diff HEAD
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git ls-files

      const result = await captureGitChanges('/workspace', 'TASK_START');

      expect(result).toBe('diff content');
      expect(execAsync).toHaveBeenCalledWith(
        'git log --grep="TASK_START" --format=%H -n 1',
        { cwd: '/workspace' }
      );
      expect(execAsync).toHaveBeenCalledWith(
        'git diff abc123 HEAD',
        { cwd: '/workspace' }
      );
    });

    it('should include uncommitted changes', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // git log
        .mockResolvedValueOnce({ stdout: 'tracked diff', stderr: '' }) // git diff base..HEAD
        .mockResolvedValueOnce({ stdout: 'uncommitted diff', stderr: '' }) // git diff HEAD
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git ls-files

      const result = await captureGitChanges('/workspace', 'TASK_START');

      expect(result).toContain('tracked diff');
      expect(result).toContain('uncommitted diff');
    });

    it('should capture untracked files as diffs', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // git log
        .mockResolvedValueOnce({ stdout: 'diff content', stderr: '' }) // git diff base..HEAD
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git diff HEAD
        .mockResolvedValueOnce({ stdout: 'new-file.txt\n', stderr: '' }); // git ls-files

      // Mock git diff for untracked file (exits with code 1 but has stdout)
      const untrackedError = new Error('exit code 1');
      untrackedError.stdout = 'untracked file diff';
      execAsync.mockRejectedValueOnce(untrackedError);

      const result = await captureGitChanges('/workspace', 'TASK_START');

      expect(result).toContain('diff content');
      expect(result).toContain('untracked file diff');
    });

    it('should handle multiple untracked files', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'file1.txt\nfile2.txt\n', stderr: '' });

      const error1 = new Error('exit 1');
      error1.stdout = 'diff for file1';
      const error2 = new Error('exit 1');
      error2.stdout = 'diff for file2';
      
      execAsync
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2);

      const result = await captureGitChanges('/workspace', 'TASK_START');

      expect(result).toContain('diff for file1');
      expect(result).toContain('diff for file2');
    });

    it('should fallback to uncommitted diff when base commit not found', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git log (no result)
        .mockResolvedValueOnce({ stdout: 'uncommitted changes', stderr: '' }) // git diff HEAD
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git ls-files

      const result = await captureGitChanges('/workspace', 'NONEXISTENT');

      expect(result).toBe('uncommitted changes');
    });

    it('should handle errors gracefully', async () => {
      execAsync.mockRejectedValue(new Error('Git command failed'));

      const result = await captureGitChanges('/workspace', 'TASK_START');

      expect(result).toContain('Error capturing diff');
      expect(result).toContain('Git command failed');
    });

    it('should handle empty untracked files list', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'diff', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // empty untracked

      const result = await captureGitChanges('/workspace', 'TASK_START');

      expect(result).toBe('diff');
    });

    it('should trim commit hash before using', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: '  abc123  \n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'diff', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await captureGitChanges('/workspace', 'TASK_START');

      expect(execAsync).toHaveBeenCalledWith(
        'git diff abc123 HEAD',
        { cwd: '/workspace' }
      );
    });
  });

  describe('captureGitCommits', () => {
    it('should capture commits after base commit', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // git log for base
        .mockResolvedValueOnce({
          stdout: 'def456|John Doe|john@example.com|2024-01-01 10:00:00|feat: add feature\nghi789|Jane Doe|jane@example.com|2024-01-02 11:00:00|fix: bug fix\n',
          stderr: ''
        }); // git log for commits

      const result = await captureGitCommits('/workspace', 'TASK_START');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        hash: 'def456',
        author: 'John Doe',
        email: 'john@example.com',
        date: '2024-01-01 10:00:00',
        message: 'feat: add feature'
      });
      expect(result[1]).toEqual({
        hash: 'ghi789',
        author: 'Jane Doe',
        email: 'jane@example.com',
        date: '2024-01-02 11:00:00',
        message: 'fix: bug fix'
      });
    });

    it('should handle commit messages with pipes', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: 'def456|John|john@example.com|2024-01-01|Message with | pipe\n',
          stderr: ''
        });

      const result = await captureGitCommits('/workspace', 'TASK_START');

      expect(result[0].message).toBe('Message with | pipe');
    });

    it('should return empty array when base commit not found', async () => {
      execAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await captureGitCommits('/workspace', 'NONEXISTENT');

      expect(result).toEqual([]);
      expect(execAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle no commits after base', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await captureGitCommits('/workspace', 'TASK_START');

      expect(result).toEqual([]);
    });

    it('should filter out empty lines', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: 'def456|John|john@example.com|2024-01-01|Message\n\n\n',
          stderr: ''
        });

      const result = await captureGitCommits('/workspace', 'TASK_START');

      expect(result).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      execAsync.mockRejectedValue(new Error('Git command failed'));

      const result = await captureGitCommits('/workspace', 'TASK_START');

      expect(result).toEqual([]);
    });

    it('should use correct git log format', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await captureGitCommits('/workspace', 'TASK_START');

      expect(execAsync).toHaveBeenNthCalledWith(
        2,
        'git log abc123..HEAD --format="%H|%an|%ae|%ai|%s"',
        { cwd: '/workspace' }
      );
    });

    it('should trim base commit hash', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: '  abc123  \n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await captureGitCommits('/workspace', 'TASK_START');

      expect(execAsync).toHaveBeenNthCalledWith(
        2,
        'git log abc123..HEAD --format="%H|%an|%ae|%ai|%s"',
        { cwd: '/workspace' }
      );
    });

    it('should handle multiline commit messages correctly', async () => {
      execAsync
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: 'def456|John|john@example.com|2024-01-01|feat: first line\n',
          stderr: ''
        });

      const result = await captureGitCommits('/workspace', 'TASK_START');

      // Format %s only gets the subject line, not the full message
      expect(result[0].message).toBe('feat: first line');
    });
  });
});

