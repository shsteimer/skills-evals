import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  parseArgs,
  matchGroups,
  compareGroup,
  compareBatches,
  deriveComparisonFocus,
  writeComparisonArtifacts
} from '../scripts/compare-batches.js';

describe('compare-batches parseArgs', () => {
  it('should parse positional baseline and candidate dirs', () => {
    const args = parseArgs(['node', 'compare-batches.js', 'results/base', 'results/candidate']);
    expect(args.baselineDir).toBe('results/base');
    expect(args.candidateDir).toBe('results/candidate');
  });

  it('should parse output-dir flag', () => {
    const args = parseArgs([
      'node', 'compare-batches.js', 'results/base', 'results/candidate',
      '--output-dir', 'results/comparisons/20260309-120000'
    ]);
    expect(args.outputDir).toBe('results/comparisons/20260309-120000');
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
      analysis: { mode: 'scripted', focus: { focusGroups: [], focusRuns: [] } },
      groups: {
        'build-block::claude': { task: 'build-block', agent: 'claude', stats: { meanScore: 8, stddev: 1, successRate: 0.8, meanTokens: 1000, meanDurationMs: 60000, runCount: 5 } },
        'fix-bug::claude': { task: 'fix-bug', agent: 'claude', stats: { meanScore: 6, stddev: 2, successRate: 0.4, meanTokens: 1400, meanDurationMs: 80000, runCount: 5 } }
      }
    };
    const candidateSummary = {
      batchDir: '/results/candidate',
      batch: { timestamp: '20260308-135902' },
      batchStats: { meanScorePct: 0.8, successRate: 0.7, meanTokens: 1100, meanDurationMs: 65000, totalRuns: 10 },
      analysis: { mode: 'scripted', focus: { focusGroups: [], focusRuns: [] } },
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

describe('deriveComparisonFocus', () => {
  it('combines batch focus inheritance with delta-based reasons', () => {
    const comparison = {
      baselineDir: '/results/base',
      candidateDir: '/results/candidate',
      matched: [
        {
          key: 'build-block::claude',
          task: 'build-block',
          agent: 'claude',
          scoreDelta: -1.2,
          successRateDelta: -0.4,
          tokensDelta: 300,
          durationDelta: 5000,
          baseline: { stddev: 0.8 },
          candidate: { stddev: 1.6 }
        }
      ],
      baselineOnly: [],
      candidateOnly: []
    };
    const baselineSummary = {
      analysis: {
        focus: {
          focusGroups: [
            { key: 'build-block::claude', reasons: ['timeout-heavy'] }
          ],
          focusRuns: [
            { key: 'build-block::claude', folderName: 'build-block-claude-1', reasons: ['timed-out'] }
          ]
        }
      }
    };
    const candidateSummary = {
      analysis: {
        focus: {
          focusGroups: [
            { key: 'build-block::claude', reasons: ['common-failures'] }
          ],
          focusRuns: [
            { key: 'build-block::claude', folderName: 'build-block-claude-2', reasons: ['failed'] }
          ]
        }
      }
    };

    const focus = deriveComparisonFocus(comparison, baselineSummary, candidateSummary);

    expect(focus.mode).toBe('scripted');
    expect(focus.focusGroups).toEqual([
      expect.objectContaining({
        key: 'build-block::claude'
      })
    ]);
    expect(focus.focusGroups[0].reasons).toEqual(expect.arrayContaining([
      'score-regression',
      'success-regression',
      'token-regression',
      'stability-regression',
      'baseline:timeout-heavy',
      'candidate:common-failures'
    ]));
    expect(focus.focusRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({ folderName: 'build-block-claude-1', batchRole: 'baseline' }),
      expect.objectContaining({ folderName: 'build-block-claude-2', batchRole: 'candidate' })
    ]));
  });
});

describe('writeComparisonArtifacts', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-batches-artifacts-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes comparison.json, compare-data.js, and comparison-focus.json', async () => {
    const comparison = {
      matched: [],
      baselineOnly: [],
      candidateOnly: [],
      analysis: { mode: 'scripted', focus: { focusGroups: [], focusRuns: [] } }
    };
    const focus = {
      mode: 'scripted',
      focusGroups: [{ key: 'hello-world::claude', reasons: ['score-regression'] }],
      focusRuns: []
    };

    await writeComparisonArtifacts(tmpDir, comparison, focus);

    const comparisonJson = JSON.parse(await fs.readFile(path.join(tmpDir, 'comparison.json'), 'utf-8'));
    const comparisonFocus = JSON.parse(await fs.readFile(path.join(tmpDir, 'comparison-focus.json'), 'utf-8'));
    const compareData = await fs.readFile(path.join(tmpDir, 'compare-data.js'), 'utf-8');

    expect(comparisonJson.analysis.focus.focusGroups).toHaveLength(1);
    expect(comparisonFocus.focusGroups[0].key).toBe('hello-world::claude');
    expect(compareData).toMatch(/^const compareData = /);
  });
});
