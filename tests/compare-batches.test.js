import { describe, it, expect } from 'vitest';
import { parseArgs, matchGroups, compareGroup, compareBatches } from '../scripts/compare-batches.js';

describe('compare-batches parseArgs', () => {
  it('should parse positional baseline and candidate dirs', () => {
    const args = parseArgs(['node', 'compare-batches.js', 'results/base', 'results/candidate']);
    expect(args.baselineDir).toBe('results/base');
    expect(args.candidateDir).toBe('results/candidate');
  });

  it('should parse output-json flag', () => {
    const args = parseArgs([
      'node', 'compare-batches.js', 'results/base', 'results/candidate',
      '--output-json', 'results/comparison.json'
    ]);
    expect(args.outputJsonPath).toBe('results/comparison.json');
  });

  it('should parse help flag', () => {
    const args = parseArgs(['node', 'compare-batches.js', '--help']);
    expect(args.showHelp).toBe(true);
  });
});

describe('matchGroups', () => {
  it('should match groups by task+agent key', () => {
    const baseline = {
      'build-block::claude': { task: 'build-block', agent: 'claude', stats: { meanScore: 8 } },
      'fix-bug::claude': { task: 'fix-bug', agent: 'claude', stats: { meanScore: 6 } }
    };
    const candidate = {
      'build-block::claude': { task: 'build-block', agent: 'claude', stats: { meanScore: 9 } },
      'fix-bug::claude': { task: 'fix-bug', agent: 'claude', stats: { meanScore: 7 } }
    };

    const result = matchGroups(baseline, candidate);
    expect(result.matched).toHaveLength(2);
    expect(result.baselineOnly).toHaveLength(0);
    expect(result.candidateOnly).toHaveLength(0);
  });

  it('should identify baseline-only and candidate-only groups', () => {
    const baseline = {
      'build-block::claude': { task: 'build-block', agent: 'claude', stats: {} },
      'old-task::claude': { task: 'old-task', agent: 'claude', stats: {} }
    };
    const candidate = {
      'build-block::claude': { task: 'build-block', agent: 'claude', stats: {} },
      'new-task::claude': { task: 'new-task', agent: 'claude', stats: {} }
    };

    const result = matchGroups(baseline, candidate);
    expect(result.matched).toHaveLength(1);
    expect(result.baselineOnly).toEqual(['old-task::claude']);
    expect(result.candidateOnly).toEqual(['new-task::claude']);
  });
});

describe('compareGroup', () => {
  it('should compute deltas for all metrics', () => {
    const baseline = { stats: { meanScore: 7, successRate: 0.6, meanTokens: 1200, meanDurationMs: 70000 } };
    const candidate = { stats: { meanScore: 9, successRate: 0.8, meanTokens: 1000, meanDurationMs: 60000 } };

    const result = compareGroup(baseline, candidate);
    expect(result.scoreDelta).toBe(2);
    expect(result.successRateDelta).toBeCloseTo(0.2);
    expect(result.tokensDelta).toBe(-200);
    expect(result.durationDelta).toBe(-10000);
  });

  it('should handle null metrics gracefully', () => {
    const baseline = { stats: { meanScore: 7, successRate: 0.6, meanTokens: null, meanDurationMs: null } };
    const candidate = { stats: { meanScore: 8, successRate: 0.8, meanTokens: null, meanDurationMs: null } };

    const result = compareGroup(baseline, candidate);
    expect(result.scoreDelta).toBe(1);
    expect(result.tokensDelta).toBeNull();
    expect(result.durationDelta).toBeNull();
  });
});

describe('compareBatches', () => {
  it('should produce complete comparison with matched groups', () => {
    const baselineSummary = {
      batchDir: '/results/base',
      batch: { timestamp: '20260308-135305' },
      batchStats: { meanScorePct: 0.7, successRate: 0.6, meanTokens: 1200, meanDurationMs: 70000, totalRuns: 10 },
      groups: {
        'build-block::claude': { task: 'build-block', agent: 'claude', stats: { meanScore: 8, stddev: 1, successRate: 0.8, meanTokens: 1000, meanDurationMs: 60000, runCount: 5 } },
        'fix-bug::claude': { task: 'fix-bug', agent: 'claude', stats: { meanScore: 6, stddev: 2, successRate: 0.4, meanTokens: 1400, meanDurationMs: 80000, runCount: 5 } }
      }
    };
    const candidateSummary = {
      batchDir: '/results/candidate',
      batch: { timestamp: '20260308-135902' },
      batchStats: { meanScorePct: 0.8, successRate: 0.7, meanTokens: 1100, meanDurationMs: 65000, totalRuns: 10 },
      groups: {
        'build-block::claude': { task: 'build-block', agent: 'claude', stats: { meanScore: 9, stddev: 0.5, successRate: 1.0, meanTokens: 900, meanDurationMs: 55000, runCount: 5 } },
        'fix-bug::claude': { task: 'fix-bug', agent: 'claude', stats: { meanScore: 7, stddev: 1.5, successRate: 0.6, meanTokens: 1300, meanDurationMs: 75000, runCount: 5 } }
      }
    };

    const result = compareBatches(baselineSummary, candidateSummary);
    expect(result.mode).toBe('aggregate');
    expect(result.matched).toHaveLength(2);
    expect(result.overallScorePctDelta).toBeCloseTo(0.1);
    expect(result.matched[0].scoreDelta).toBe(1);
  });
});
