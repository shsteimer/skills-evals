import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  parseArgs,
  groupRuns,
  computeGroupStats,
  computeBatchStats,
  loadBatchRuns,
  deriveBatchFocus,
  summarizeBatch
} from '../scripts/summarize-batch.js';

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

  it('should count timed-out runs in group stats', () => {
    const group = {
      task: 'build-block',
      agent: 'claude',
      runs: [
        { score: 8, maxScore: 10, overallSuccess: true, totalTokens: 1000, durationMs: 60000, timedOut: false, criteriaChecks: [] },
        { score: 4, maxScore: 10, overallSuccess: false, totalTokens: 500, durationMs: 300000, timedOut: true, criteriaChecks: [] },
        { score: 10, maxScore: 10, overallSuccess: true, totalTokens: 800, durationMs: 50000, timedOut: false, criteriaChecks: [] }
      ]
    };

    const stats = computeGroupStats(group);
    expect(stats.timedOutCount).toBe(1);
  });

  it('should set timedOutCount to 0 when no runs timed out', () => {
    const group = {
      task: 'build-block',
      agent: 'claude',
      runs: [
        { score: 8, maxScore: 10, overallSuccess: true, totalTokens: 1000, durationMs: 60000, timedOut: false, criteriaChecks: [] }
      ]
    };

    const stats = computeGroupStats(group);
    expect(stats.timedOutCount).toBe(0);
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

describe('loadBatchRuns', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'summarize-batch-load-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prefers run-report.json when present', async () => {
    const runDir = path.join(tmpDir, 'build-block-claude-1');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'task.json'), JSON.stringify({
      name: 'build-block',
      agent: 'claude',
      iteration: 1,
    }));
    await fs.writeFile(path.join(runDir, 'run-report.json'), JSON.stringify({
      evaluationMode: 'scripted',
      mechanicalScore: 2,
      mechanicalMaxScore: 3,
      mechanicalSuccess: true,
      resolvedCriteria: [{ name: 'lint', met: true }],
      unresolvedCriteriaCount: 1,
      warnings: ['no-commits'],
      runMetrics: {
        durationMs: 1000,
        tokenUsage: { totalTokens: 50 },
        timedOut: false,
      },
    }));
    await fs.writeFile(path.join(runDir, 'eval-result.json'), JSON.stringify({
      score: 99,
      maxScore: 100,
      overallSuccess: false,
      criteriaChecks: [],
    }));

    const runs = await loadBatchRuns(tmpDir);

    expect(runs).toHaveLength(1);
    expect(runs[0].score).toBe(2);
    expect(runs[0].maxScore).toBe(3);
    expect(runs[0].overallSuccess).toBe(true);
    expect(runs[0].reportSource).toBe('run-report');
    expect(runs[0].warnings).toEqual(['no-commits']);
  });

  it('falls back to eval-result.json for older batches', async () => {
    const runDir = path.join(tmpDir, 'build-block-claude-1');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'task.json'), JSON.stringify({
      name: 'build-block',
      agent: 'claude',
      iteration: 1,
    }));
    await fs.writeFile(path.join(runDir, 'eval-result.json'), JSON.stringify({
      score: 8,
      maxScore: 10,
      overallSuccess: true,
      criteriaChecks: [{ name: 'lint', met: true }],
    }));
    await fs.writeFile(path.join(runDir, 'run-metrics.json'), JSON.stringify({
      durationMs: 2000,
      tokenUsage: { totalTokens: 75 },
      timedOut: false,
    }));

    const runs = await loadBatchRuns(tmpDir);

    expect(runs).toHaveLength(1);
    expect(runs[0].score).toBe(8);
    expect(runs[0].reportSource).toBe('eval-result');
  });
});

describe('deriveBatchFocus', () => {
  it('flags unstable, failing, timeout-heavy, and warning-heavy groups', () => {
    const groups = {
      'build-block::claude': {
        task: 'build-block',
        agent: 'claude',
        stats: {
          runCount: 3,
          meanScorePct: 0.55,
          stddev: 1.4,
          successRate: 0.33,
          timedOutCount: 2,
          commonFailures: ['lint-passes'],
        },
        runs: [
          { folderName: 'run-1', iteration: 1, score: 1, maxScore: 3, overallSuccess: false, warnings: ['timed-out', 'no-commits'] },
          { folderName: 'run-2', iteration: 2, score: 2, maxScore: 3, overallSuccess: false, warnings: ['timed-out'] },
          { folderName: 'run-3', iteration: 3, score: 2, maxScore: 3, overallSuccess: true, warnings: [] },
        ],
      },
    };

    const focus = deriveBatchFocus(groups);

    expect(focus.focusGroups).toEqual([
      expect.objectContaining({
        key: 'build-block::claude',
      }),
    ]);
    expect(focus.focusGroups[0].reasons).toEqual(expect.arrayContaining([
      'low-success-rate',
      'timeout-heavy',
      'common-failures',
      'high-variance',
    ]));
    expect(focus.focusRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({ folderName: 'run-1' }),
      expect.objectContaining({ folderName: 'run-2' }),
    ]));
  });
});

describe('summarizeBatch', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'summarize-batch-summary-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('includes scripted focus data in batch summaries', async () => {
    const runDir = path.join(tmpDir, 'build-block-claude-1');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'task.json'), JSON.stringify({
      name: 'build-block',
      agent: 'claude',
      iteration: 1,
    }));
    await fs.writeFile(path.join(runDir, 'run-report.json'), JSON.stringify({
      evaluationMode: 'scripted',
      mechanicalScore: 1,
      mechanicalMaxScore: 3,
      mechanicalSuccess: false,
      resolvedCriteria: [{ name: 'lint-passes', met: false }],
      unresolvedCriteriaCount: 1,
      warnings: ['timed-out'],
      runMetrics: {
        durationMs: 1000,
        tokenUsage: { totalTokens: 50 },
        timedOut: true,
      },
    }));

    const summary = await summarizeBatch(tmpDir);

    expect(summary.analysis.mode).toBe('scripted');
    expect(summary.analysis.focus.focusGroups).toHaveLength(1);
    expect(summary.groups['build-block::claude'].stats.timedOutCount).toBe(1);
  });
});
