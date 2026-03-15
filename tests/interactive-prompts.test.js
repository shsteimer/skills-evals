import { describe, it, expect } from 'vitest';
import { hasUserFlags } from '../scripts/utils/interactive-prompts.js';

describe('hasUserFlags', () => {
  it('should return false when no flags provided', () => {
    expect(hasUserFlags(['node', 'script.js'])).toBe(false);
  });

  it('should return true for --task flag', () => {
    expect(hasUserFlags(['node', 'script.js', '--task', 'build-block'])).toBe(true);
  });

  it('should return true for --agents flag', () => {
    expect(hasUserFlags(['node', 'script.js', '--agents', 'claude'])).toBe(true);
  });

  it('should return true for -h flag', () => {
    expect(hasUserFlags(['node', 'script.js', '-h'])).toBe(true);
  });

  it('should return true for --help flag', () => {
    expect(hasUserFlags(['node', 'script.js', '--help'])).toBe(true);
  });

  it('should return false for bare -- separator', () => {
    expect(hasUserFlags(['node', 'script.js', '--'])).toBe(false);
  });

  it('should return true for mixed flags', () => {
    expect(hasUserFlags(['node', 'script.js', '--task', 'x', '--times', '3'])).toBe(true);
  });

  it('should return false when only positional args exist', () => {
    expect(hasUserFlags(['node', 'script.js', 'some-value'])).toBe(false);
  });
});
