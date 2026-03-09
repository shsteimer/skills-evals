import { describe, it, expect } from 'vitest';
import { parseArgs, groupRuns, computeGroupStats, computeBatchStats } from '../scripts/summarize-batch.js';

describe('summarize-batch parseArgs', () => {
  it('should parse positional batch dir', () => {
    const args = parseArgs(['node', 'summarize-batch.js', 'results/20260308-135305']);
    expect(args.batchDir).toBe('results/20260308-135305');
  });

  it('should return null batchDir when not specified', () => {
    const args = parseArgs(['node', 'summarize-batch.js']);
    expect(args.batchDir).toBeNull();
  });

  it('should parse help flag', () => {
    const args = parseArgs(['node', 'summarize-batch.js', '--help']);
    expect(args.showHelp).toBe(true);
  });
});

describe('groupRuns', () => {
  it('should group runs by task::agent key', () => {
    const runs = [
      { task: 'build-block', agent: 'claude', iteration: 1, score: 8 },
      { task: 'build-block', agent: 'claude', iteration: 2, score: 10 },
      { task: 'build-block', agent: 'cursor', iteration: 1, score: 6 }
    ];

    const groups = groupRuns(runs);
    expect(Object.keys(groups)).toEqual(['build-block::claude', 'build-block::cursor']);
    expect(groups['build-block::claude'].runs).toHaveLength(2);
    expect(groups['build-block::cursor'].runs).toHaveLength(1);
  });

  it('should set task and agent on each group', () => {
    const runs = [
      { task: 'fix-bug', agent: 'codex', iteration: 1, score: 5 }
    ];

    const groups = groupRuns(runs);
    expect(groups['fix-bug::codex'].task).toBe('fix-bug');
    expect(groups['fix-bug::codex'].agent).toBe('codex');
  });
});

describe('computeGroupStats', () => {
  it('should compute mean, stddev, min, max for scores', () => {
    const group = {
      task: 'build-block',
      agent: 'claude',
      runs: [
        { score: 8, maxScore: 10, overallSuccess: true, totalTokens: 1000, durationMs: 60000, criteriaChecks: [] },
        { score: 6, maxScore: 10, overallSuccess: false, totalTokens: 1200, durationMs: 70000, criteriaChecks: [] },
        { score: 10, maxScore: 10, overallSuccess: true, totalTokens: 800, durationMs: 50000, criteriaChecks: [] }
      ]
    };

    const stats = computeGroupStats(group);
    expect(stats.meanScore).toBe(8);
    expect(stats.meanScorePct).toBeCloseTo(0.8);
    expect(stats.minScore).toBe(6);
    expect(stats.maxScore).toBe(10);
    expect(stats.successRate).toBeCloseTo(2 / 3);
    expect(stats.meanTokens).toBe(1000);
    expect(stats.meanDurationMs).toBe(60000);
    expect(stats.stddev).toBeCloseTo(1.633, 2);
  });

  it('should handle single-iteration group with stddev 0', () => {
    const group = {
      task: 'build-block',
      agent: 'claude',
      runs: [
        { score: 8, maxScore: 10, overallSuccess: true, totalTokens: 1000, durationMs: 60000, criteriaChecks: [] }
      ]
    };

    const stats = computeGroupStats(group);
    expect(stats.meanScore).toBe(8);
    expect(stats.stddev).toBe(0);
  });

  it('should handle missing tokens and duration with nulls', () => {
    const group = {
      task: 'build-block',
      agent: 'claude',
      runs: [
        { score: 8, maxScore: 10, overallSuccess: true, totalTokens: null, durationMs: null, criteriaChecks: [] }
      ]
    };

    const stats = computeGroupStats(group);
    expect(stats.meanTokens).toBeNull();
    expect(stats.meanDurationMs).toBeNull();
  });

  it('should identify common criteria failures (>50% of iterations)', () => {
    const group = {
      task: 'build-block',
      agent: 'claude',
      runs: [
        {
          score: 6, maxScore: 10, overallSuccess: false, totalTokens: 1000, durationMs: 60000,
          criteriaChecks: [
            { name: 'lint-passes', met: false },
            { name: 'tests-pass', met: true }
          ]
        },
        {
          score: 7, maxScore: 10, overallSuccess: false, totalTokens: 1100, durationMs: 65000,
          criteriaChecks: [
            { name: 'lint-passes', met: false },
            { name: 'tests-pass', met: false }
          ]
        },
        {
          score: 9, maxScore: 10, overallSuccess: true, totalTokens: 900, durationMs: 55000,
          criteriaChecks: [
            { name: 'lint-passes', met: true },
            { name: 'tests-pass', met: true }
          ]
        }
      ]
    };

    const stats = computeGroupStats(group);
    // lint-passes fails in 2/3 runs (66%) — should be common failure
    // tests-pass fails in 1/3 runs (33%) — should NOT be common failure
    expect(stats.commonFailures).toEqual(['lint-passes']);
  });
});

describe('computeBatchStats', () => {
  it('should compute overall batch stats from groups using score percentage', () => {
    const groups = {
      'build-block::claude': {
        task: 'build-block', agent: 'claude',
        stats: { meanScorePct: 0.8, successRate: 0.8, meanTokens: 1000, meanDurationMs: 60000, runCount: 5 }
      },
      'fix-bug::claude': {
        task: 'fix-bug', agent: 'claude',
        stats: { meanScorePct: 0.6, successRate: 0.4, meanTokens: 1200, meanDurationMs: 70000, runCount: 5 }
      }
    };

    const stats = computeBatchStats(groups);
    expect(stats.meanScorePct).toBeCloseTo(0.7);
    expect(stats.successRate).toBeCloseTo(0.6);
    expect(stats.meanTokens).toBe(1100);
    expect(stats.meanDurationMs).toBe(65000);
    expect(stats.totalRuns).toBe(10);
  });

  it('should handle groups with null tokens', () => {
    const groups = {
      'build-block::claude': {
        task: 'build-block', agent: 'claude',
        stats: { meanScorePct: 0.8, successRate: 1.0, meanTokens: null, meanDurationMs: null, runCount: 1 }
      }
    };

    const stats = computeBatchStats(groups);
    expect(stats.meanTokens).toBeNull();
    expect(stats.meanDurationMs).toBeNull();
  });
});
