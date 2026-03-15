import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { scanResults } from '../scripts/serve.js';

describe('scanResults', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'serve-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should find batch summaries', async () => {
    const batchDir = path.join(tmpDir, '20260309-101122');
    await fs.mkdir(batchDir, { recursive: true });
    await fs.writeFile(path.join(batchDir, 'batch-summary-data.js'), 'data');

    const result = await scanResults(tmpDir);

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].timestamp).toBe('20260309-101122');
    expect(result.batches[0].dataPath).toContain('batch-summary-data.js');
  });

  it('should find comparisons', async () => {
    const compDir = path.join(tmpDir, 'comparisons', '20260309-115836');
    await fs.mkdir(compDir, { recursive: true });
    await fs.writeFile(path.join(compDir, 'compare-data.js'), 'data');

    const result = await scanResults(tmpDir);

    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].timestamp).toBe('20260309-115836');
    expect(result.comparisons[0].dataPath).toContain('compare-data.js');
  });

  it('should sort newest first', async () => {
    for (const ts of ['20260308-100000', '20260309-100000', '20260307-100000']) {
      const dir = path.join(tmpDir, ts);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'batch-summary-data.js'), 'data');
    }

    const result = await scanResults(tmpDir);

    expect(result.batches.map(b => b.timestamp)).toEqual([
      '20260309-100000', '20260308-100000', '20260307-100000'
    ]);
  });

  it('should skip directories without data files', async () => {
    const batchDir = path.join(tmpDir, '20260309-101122');
    await fs.mkdir(batchDir, { recursive: true });
    await fs.writeFile(path.join(batchDir, 'batch-summary.json'), '{}');
    // No batch-summary-data.js

    const result = await scanResults(tmpDir);

    expect(result.batches).toHaveLength(0);
  });

  it('should handle missing comparisons directory', async () => {
    const result = await scanResults(tmpDir);

    expect(result.comparisons).toHaveLength(0);
    expect(result.batches).toHaveLength(0);
  });

  it('should read batch metadata when available', async () => {
    const batchDir = path.join(tmpDir, '20260309-101122');
    await fs.mkdir(batchDir, { recursive: true });
    await fs.writeFile(path.join(batchDir, 'batch-summary-data.js'), 'data');
    await fs.writeFile(path.join(batchDir, 'batch-summary.json'), JSON.stringify({
      batch: { augmentationSetName: 'Skills Only', taskNames: ['hello-world', 'skill-check'] },
      batchStats: { meanScorePct: 0.914, successRate: 0.778, totalRuns: 18 }
    }));

    const result = await scanResults(tmpDir);

    expect(result.batches[0].augmentation).toBe('Skills Only');
    expect(result.batches[0].tasks).toEqual(['hello-world', 'skill-check']);
    expect(result.batches[0].stats.meanScorePct).toBeCloseTo(0.914);
    expect(result.batches[0].stats.totalRuns).toBe(18);
  });

  it('should read comparison metadata when available', async () => {
    const compDir = path.join(tmpDir, 'comparisons', '20260309-115836');
    await fs.mkdir(compDir, { recursive: true });
    await fs.writeFile(path.join(compDir, 'compare-data.js'), 'data');
    await fs.writeFile(path.join(compDir, 'comparison.json'), JSON.stringify({
      baselineBatch: { timestamp: '20260309-101122' },
      candidateBatch: { timestamp: '20260309-101454' },
      analysis: { recommendation: 'no', confidence: 'high' }
    }));

    const result = await scanResults(tmpDir);

    expect(result.comparisons[0].baseline).toBe('20260309-101122');
    expect(result.comparisons[0].candidate).toBe('20260309-101454');
    expect(result.comparisons[0].recommendation).toBe('no');
    expect(result.comparisons[0].confidence).toBe('high');
  });
});
