import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyBatchEvals } from '../scripts/verify-batch-evals.js';

// Mock fs
vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn()
  }
}));

import fs from 'fs/promises';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('verifyBatchEvals', () => {
  it('should report all runs evaluated when every run has eval-result.json', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'build-block-claude-1', isDirectory: () => true },
      { name: 'build-block-claude-2', isDirectory: () => true }
    ]);
    // task.json exists for both
    fs.readFile.mockResolvedValue(JSON.stringify({ name: 'build-block', agent: 'claude' }));
    // eval-result.json exists for both
    fs.access.mockResolvedValue(undefined);

    const result = await verifyBatchEvals('/results/20260309');

    expect(result.totalRuns).toBe(2);
    expect(result.evaluatedCount).toBe(2);
    expect(result.missingEvals).toEqual([]);
    expect(result.allEvaluated).toBe(true);
  });

  it('should report missing evals when some runs lack eval-result.json', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'build-block-claude-1', isDirectory: () => true },
      { name: 'build-block-claude-2', isDirectory: () => true },
      { name: 'build-block-claude-3', isDirectory: () => true }
    ]);
    fs.readFile.mockResolvedValue(JSON.stringify({ name: 'build-block', agent: 'claude' }));
    // First has eval, second and third don't
    fs.access
      .mockResolvedValueOnce(undefined) // task.json check for run 1
      .mockResolvedValueOnce(undefined) // eval-result.json check for run 1
      .mockResolvedValueOnce(undefined) // task.json check for run 2
      .mockRejectedValueOnce(new Error('ENOENT')) // eval-result.json missing for run 2
      .mockResolvedValueOnce(undefined) // task.json check for run 3
      .mockRejectedValueOnce(new Error('ENOENT')); // eval-result.json missing for run 3

    const result = await verifyBatchEvals('/results/20260309');

    expect(result.totalRuns).toBe(3);
    expect(result.evaluatedCount).toBe(1);
    expect(result.missingEvals).toEqual(['build-block-claude-2', 'build-block-claude-3']);
    expect(result.allEvaluated).toBe(false);
  });

  it('should skip non-run directories (no task.json)', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'build-block-claude-1', isDirectory: () => true },
      { name: '.git', isDirectory: () => true }
    ]);
    // First dir has task.json, second doesn't
    fs.access
      .mockResolvedValueOnce(undefined) // task.json for run 1
      .mockResolvedValueOnce(undefined) // eval-result.json for run 1
      .mockRejectedValueOnce(new Error('ENOENT')); // no task.json for .git

    const result = await verifyBatchEvals('/results/20260309');

    expect(result.totalRuns).toBe(1);
    expect(result.evaluatedCount).toBe(1);
  });

  it('should skip non-directory entries', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'batch.json', isDirectory: () => false },
      { name: 'batch.log', isDirectory: () => false },
      { name: 'build-block-claude-1', isDirectory: () => true }
    ]);
    fs.access.mockResolvedValue(undefined);

    const result = await verifyBatchEvals('/results/20260309');

    expect(result.totalRuns).toBe(1);
  });

  it('should return empty results for batch with no runs', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'batch.json', isDirectory: () => false }
    ]);

    const result = await verifyBatchEvals('/results/20260309');

    expect(result.totalRuns).toBe(0);
    expect(result.evaluatedCount).toBe(0);
    expect(result.missingEvals).toEqual([]);
    expect(result.allEvaluated).toBe(true);
  });
});
