import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { assembleBatchSummary } from '../scripts/assemble-batch-summary.js';

describe('assembleBatchSummary', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assemble-batch-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSummary(summary) {
    await fs.writeFile(path.join(tmpDir, 'batch-summary.json'), JSON.stringify(summary), 'utf-8');
  }

  async function writeAnalysis(analysis) {
    await fs.writeFile(path.join(tmpDir, 'batch-analysis.json'), JSON.stringify(analysis), 'utf-8');
  }

  it('should merge per-group analysis into matching groups', async () => {
    await writeSummary({
      groups: {
        'hello-world::claude': { task: 'hello-world', agent: 'claude', stats: {} },
        'hello-world::codex': { task: 'hello-world', agent: 'codex', stats: {} }
      }
    });
    await writeAnalysis({
      perGroup: {
        'hello-world::claude': {
          findings: 'Perfect scores across all iterations.',
          concerns: []
        },
        'hello-world::codex': {
          findings: 'Consistent performance but high token usage.',
          concerns: ['Token usage 3x higher than claude']
        }
      },
      crossCutting: ['All agents completed the task successfully.'],
      highlights: ['Claude used the fewest tokens.']
    });

    const result = await assembleBatchSummary(tmpDir);

    expect(result.groups['hello-world::claude'].analysis.findings).toBe('Perfect scores across all iterations.');
    expect(result.groups['hello-world::claude'].analysis.concerns).toEqual([]);
    expect(result.groups['hello-world::codex'].analysis.concerns).toEqual(['Token usage 3x higher than claude']);
  });

  it('should add batch-level analysis with crossCutting and highlights', async () => {
    await writeSummary({ groups: {} });
    await writeAnalysis({
      perGroup: {},
      crossCutting: ['Pattern A', 'Pattern B'],
      highlights: ['Highlight 1']
    });

    const result = await assembleBatchSummary(tmpDir);

    expect(result.analysis.crossCutting).toEqual(['Pattern A', 'Pattern B']);
    expect(result.analysis.highlights).toEqual(['Highlight 1']);
  });

  it('should write updated batch-summary.json', async () => {
    await writeSummary({ groups: {} });
    await writeAnalysis({ perGroup: {}, crossCutting: ['test'], highlights: [] });

    await assembleBatchSummary(tmpDir);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'batch-summary.json'), 'utf-8'));
    expect(written.analysis.crossCutting).toEqual(['test']);
  });

  it('should write updated batch-summary-data.js', async () => {
    await writeSummary({ groups: {} });
    await writeAnalysis({ perGroup: {}, crossCutting: [], highlights: ['h1'] });

    await assembleBatchSummary(tmpDir);

    const dataJs = await fs.readFile(path.join(tmpDir, 'batch-summary-data.js'), 'utf-8');
    expect(dataJs).toMatch(/^const batchSummaryData = /);
    expect(dataJs).toContain('"h1"');
  });

  it('should skip groups in analysis that do not exist in summary', async () => {
    await writeSummary({
      groups: {
        'hello-world::claude': { task: 'hello-world', agent: 'claude', stats: {} }
      }
    });
    await writeAnalysis({
      perGroup: {
        'hello-world::claude': { findings: 'Good.', concerns: [] },
        'nonexistent::agent': { findings: 'Should be ignored.', concerns: [] }
      },
      crossCutting: [],
      highlights: []
    });

    const result = await assembleBatchSummary(tmpDir);

    expect(result.groups['hello-world::claude'].analysis).toBeDefined();
    expect(result.groups['nonexistent::agent']).toBeUndefined();
  });

  it('should handle missing crossCutting and highlights gracefully', async () => {
    await writeSummary({ groups: {} });
    await writeAnalysis({ perGroup: {} });

    const result = await assembleBatchSummary(tmpDir);

    expect(result.analysis.crossCutting).toEqual([]);
    expect(result.analysis.highlights).toEqual([]);
  });
});
