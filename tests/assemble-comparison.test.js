import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { assembleComparison } from '../scripts/assemble-comparison.js';

describe('assembleComparison', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assemble-comparison-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeComparison(comparison) {
    await fs.writeFile(path.join(tmpDir, 'comparison.json'), JSON.stringify(comparison), 'utf-8');
  }

  async function writeAnalysis(analysis) {
    await fs.writeFile(path.join(tmpDir, 'comparison-analysis.json'), JSON.stringify(analysis), 'utf-8');
  }

  const baseComparison = {
    mode: 'aggregate',
    baselineDir: '/results/base',
    candidateDir: '/results/candidate',
    matched: [
      { key: 'hello-world::claude', task: 'hello-world', agent: 'claude', scoreDelta: 1.5 },
      { key: 'fix-bug::claude', task: 'fix-bug', agent: 'claude', scoreDelta: -0.3 }
    ],
    baselineOnly: [],
    candidateOnly: []
  };

  const baseAnalysis = {
    recommendation: 'yes',
    confidence: 'high',
    reasoning: 'Candidate shows clear improvements in quality scores with minimal efficiency tradeoffs.',
    perGroup: [
      { key: 'hello-world::claude', verdict: 'improved', reasoning: 'Score improved by 1.5 with lower token usage.' },
      { key: 'fix-bug::claude', verdict: 'stable', reasoning: 'Minor regression within noise threshold.' }
    ]
  };

  it('should merge analysis into comparison data', async () => {
    await writeComparison(baseComparison);
    await writeAnalysis(baseAnalysis);

    const result = await assembleComparison(tmpDir);

    expect(result.analysis.recommendation).toBe('yes');
    expect(result.analysis.confidence).toBe('high');
    expect(result.analysis.reasoning).toContain('clear improvements');
  });

  it('should merge per-group verdicts into matched groups', async () => {
    await writeComparison(baseComparison);
    await writeAnalysis(baseAnalysis);

    const result = await assembleComparison(tmpDir);

    expect(result.matched[0].analysis).toEqual({
      verdict: 'improved',
      reasoning: 'Score improved by 1.5 with lower token usage.'
    });
    expect(result.matched[1].analysis).toEqual({
      verdict: 'stable',
      reasoning: 'Minor regression within noise threshold.'
    });
  });

  it('should write updated comparison.json', async () => {
    await writeComparison(baseComparison);
    await writeAnalysis(baseAnalysis);

    await assembleComparison(tmpDir);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'comparison.json'), 'utf-8'));
    expect(written.analysis.recommendation).toBe('yes');
  });

  it('should write updated compare-data.js', async () => {
    await writeComparison(baseComparison);
    await writeAnalysis(baseAnalysis);

    await assembleComparison(tmpDir);

    const dataJs = await fs.readFile(path.join(tmpDir, 'compare-data.js'), 'utf-8');
    expect(dataJs).toMatch(/^const compareData = /);
    expect(dataJs).toContain('"recommendation"');
    expect(dataJs).toContain('"yes"');
  });

  it('should skip per-group verdicts for keys not in matched', async () => {
    await writeComparison(baseComparison);
    await writeAnalysis({
      ...baseAnalysis,
      perGroup: [
        ...baseAnalysis.perGroup,
        { key: 'nonexistent::agent', verdict: 'improved', reasoning: 'Should be ignored.' }
      ]
    });

    const result = await assembleComparison(tmpDir);

    expect(result.matched).toHaveLength(2);
    expect(result.matched.every(m => m.key !== 'nonexistent::agent')).toBe(true);
  });

  it('should handle missing perGroup gracefully', async () => {
    await writeComparison(baseComparison);
    await writeAnalysis({
      recommendation: 'inconclusive',
      confidence: 'low',
      reasoning: 'Not enough data.'
    });

    const result = await assembleComparison(tmpDir);

    expect(result.analysis.recommendation).toBe('inconclusive');
    expect(result.matched[0].analysis).toBeUndefined();
  });

  it('preserves scripted focus data when merging recommendation analysis', async () => {
    await writeComparison({
      ...baseComparison,
      analysis: {
        mode: 'scripted',
        focus: {
          focusGroups: [
            { key: 'hello-world::claude', reasons: ['score-improvement'] }
          ],
          focusRuns: [
            {
              key: 'hello-world::claude',
              folderName: 'hello-world-claude-1',
              batchRole: 'candidate',
              reasons: ['resolved-unusual-failure']
            }
          ]
        }
      }
    });
    await writeAnalysis(baseAnalysis);

    const result = await assembleComparison(tmpDir);

    expect(result.analysis.mode).toBe('scripted');
    expect(result.analysis.focus.focusGroups).toHaveLength(1);
    expect(result.analysis.recommendation).toBe('yes');
    expect(result.analysis.focus.focusRuns[0].folderName).toBe('hello-world-claude-1');
  });
});
