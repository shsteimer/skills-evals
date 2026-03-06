import { describe, it, expect } from 'vitest';
import { compareRuns, parseArgs } from '../scripts/compare-runs.js';

describe('compare-runs parseArgs', () => {
  it('should parse positional baseline/candidate directories', () => {
    const args = parseArgs(['node', 'compare-runs.js', 'results/base', 'results/candidate']);
    expect(args.baselineDir).toBe('results/base');
    expect(args.candidateDir).toBe('results/candidate');
  });

  it('should parse thresholds', () => {
    const args = parseArgs([
      'node',
      'compare-runs.js',
      'results/base',
      'results/candidate',
      '--min-gain',
      '2',
      '--max-regressions',
      '1'
    ]);
    expect(args.minMeasurableGains).toBe(2);
    expect(args.maxQualityRegressions).toBe(1);
  });

  it('should parse relevance and manifest options', () => {
    const args = parseArgs([
      'node',
      'compare-runs.js',
      'results/base',
      'results/candidate',
      '--manifest',
      'config/gate-manifest.json',
      '--relevance-file',
      'tmp/relevance.json',
      '--context-file',
      'tmp/context.txt'
    ]);
    expect(args.manifestFile).toBe('config/gate-manifest.json');
    expect(args.relevanceFile).toBe('tmp/relevance.json');
    expect(args.contextFile).toBe('tmp/context.txt');
  });

  it('should parse require-gain and soft-fail options', () => {
    const args = parseArgs([
      'node',
      'compare-runs.js',
      'results/base',
      'results/candidate',
      '--require-gain',
      'false',
      '--soft-fail-on-infra',
      'true'
    ]);
    expect(args.requireGain).toBe(false);
    expect(args.softFailOnInfra).toBe(true);
  });
});

describe('compareRuns', () => {
  it('should count equal quality with lower tokens as measurable gain', () => {
    const baseline = new Map([
      [
        'task::codex::1',
        { task: 'task', agent: 'codex', iteration: 1, score: 8, overallSuccess: true, totalTokens: 1000 }
      ]
    ]);
    const candidate = new Map([
      [
        'task::codex::1',
        { task: 'task', agent: 'codex', iteration: 1, score: 8, overallSuccess: true, totalTokens: 800 }
      ]
    ]);

    const result = compareRuns(baseline, candidate);
    expect(result.qualityRegressions).toBe(0);
    expect(result.measurableGains).toBe(1);
    expect(result.comparisons[0].tokenGainWithStableQuality).toBe(true);
    expect(result.comparisons[0].efficiencyGain).toBe(true);
  });

  it('should count equal quality with lower duration as measurable gain', () => {
    const baseline = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 8, overallSuccess: true, durationMs: 60000 }]
    ]);
    const candidate = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 8, overallSuccess: true, durationMs: 45000 }]
    ]);

    const result = compareRuns(baseline, candidate);
    expect(result.qualityRegressions).toBe(0);
    expect(result.measurableGains).toBe(1);
    expect(result.comparisons[0].durationGainWithStableQuality).toBe(true);
    expect(result.comparisons[0].efficiencyGain).toBe(true);
  });

  it('should count lower score as quality regression', () => {
    const baseline = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 8, totalTokens: 500 }]
    ]);
    const candidate = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 7, totalTokens: 450 }]
    ]);

    const result = compareRuns(baseline, candidate);
    expect(result.qualityRegressions).toBe(1);
    expect(result.measurableGains).toBe(0);
  });

  it('should treat missing score as regression for relevant blocking gates', () => {
    const baseline = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 8, totalTokens: 500 }]
    ]);
    const candidate = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: null, overallSuccess: null, totalTokens: 450 }]
    ]);

    const result = compareRuns(baseline, candidate, {
      manifestMap: { task: { blocking: true } }
    });

    expect(result.qualityRegressions).toBe(1);
    expect(result.scoringFailures).toBe(1);
  });

  it('should skip non-relevant gates from regression counts', () => {
    const baseline = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 8, totalTokens: 500 }]
    ]);
    const candidate = new Map([
      ['task::codex::1', { task: 'task', agent: 'codex', iteration: 1, score: 7, totalTokens: 450 }]
    ]);

    const result = compareRuns(baseline, candidate, {
      relevanceMap: { task: { relevant: false, reason: 'Out of scope' } }
    });

    expect(result.qualityRegressions).toBe(0);
    expect(result.skippedNotRelevant).toBe(1);
    expect(result.comparisons[0].relevant).toBe(false);
  });
});
