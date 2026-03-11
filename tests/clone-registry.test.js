import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloneRegistry } from '../scripts/utils/clone-registry.js';

// Mock git-utils
vi.mock('../scripts/utils/git-utils.js', () => ({
  cloneRepository: vi.fn()
}));

// Mock fs-utils
vi.mock('../scripts/utils/fs-utils.js', () => ({
  ensureDir: vi.fn()
}));

import { cloneRepository } from '../scripts/utils/git-utils.js';

describe('CloneRegistry', () => {
  let registry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new CloneRegistry();
  });

  it('should clone on first call for a given url+ref', async () => {
    const result = await registry.getOrCreate(
      'https://github.com/org/repo.git', 'main', false, '/tmp/clones'
    );

    expect(cloneRepository).toHaveBeenCalledTimes(1);
    expect(cloneRepository).toHaveBeenCalledWith(
      'https://github.com/org/repo.git',
      expect.stringContaining('repo-main'),
      { branch: 'main', isCommitHash: false }
    );
    expect(result).toContain('repo-main');
  });

  it('should return same path for duplicate url+ref without cloning again', async () => {
    const first = await registry.getOrCreate(
      'https://github.com/org/repo.git', 'main', false, '/tmp/clones'
    );
    const second = await registry.getOrCreate(
      'https://github.com/org/repo.git', 'main', false, '/tmp/clones'
    );

    expect(cloneRepository).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('should clone separately for different refs', async () => {
    await registry.getOrCreate(
      'https://github.com/org/repo.git', 'main', false, '/tmp/clones'
    );
    await registry.getOrCreate(
      'https://github.com/org/repo.git', 'develop', false, '/tmp/clones'
    );

    expect(cloneRepository).toHaveBeenCalledTimes(2);
  });

  it('should clone separately for different repos', async () => {
    await registry.getOrCreate(
      'https://github.com/org/repo-a.git', 'main', false, '/tmp/clones'
    );
    await registry.getOrCreate(
      'https://github.com/org/repo-b.git', 'main', false, '/tmp/clones'
    );

    expect(cloneRepository).toHaveBeenCalledTimes(2);
  });

  it('should handle concurrent calls for the same url+ref', async () => {
    const [first, second] = await Promise.all([
      registry.getOrCreate('https://github.com/org/repo.git', 'main', false, '/tmp/clones'),
      registry.getOrCreate('https://github.com/org/repo.git', 'main', false, '/tmp/clones')
    ]);

    expect(cloneRepository).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('should propagate clone errors to all waiters', async () => {
    cloneRepository.mockImplementationOnce(() => {
      throw new Error('clone failed');
    });

    const p1 = registry.getOrCreate('https://github.com/org/repo.git', 'main', false, '/tmp/clones');
    const p2 = registry.getOrCreate('https://github.com/org/repo.git', 'main', false, '/tmp/clones');

    await expect(p1).rejects.toThrow('clone failed');
    await expect(p2).rejects.toThrow('clone failed');
  });

  it('should pass isCommitHash flag through to cloneRepository', async () => {
    await registry.getOrCreate(
      'https://github.com/org/repo.git', 'abc123', true, '/tmp/clones'
    );

    expect(cloneRepository).toHaveBeenCalledWith(
      'https://github.com/org/repo.git',
      expect.any(String),
      { branch: 'abc123', isCommitHash: true }
    );
  });

  it('should sanitize branch names with slashes in directory name', async () => {
    const result = await registry.getOrCreate(
      'https://github.com/org/repo.git', 'feature/foo', false, '/tmp/clones'
    );

    expect(result).toContain('repo-feature-foo');
    expect(result).not.toContain('/foo');
  });
});
