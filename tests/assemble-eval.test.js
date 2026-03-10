import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { assembleEval } from '../scripts/assemble-eval.js';

describe('assembleEval', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assemble-eval-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeResultFile(name, data) {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.writeFile(path.join(tmpDir, name), content, 'utf-8');
  }

  it('writes a run-report alongside eval-result output', async () => {
    await writeResultFile('task.json', {
      name: 'build-block',
      agent: 'claude',
      timestamp: '20260310-120000',
      startFrom: 'https://github.com/example/repo',
    });
    await writeResultFile('criteria.txt', `## Checks
<critical>
- Files exist [check: files-exist]
</critical>
`);
    await writeResultFile('check-results.json', [
      {
        name: 'files-exist',
        description: 'Files exist',
        passed: true,
        evidence: 'Found expected files',
      },
    ]);
    await writeResultFile('run-metrics.json', {
      durationMs: 1234,
      tokenUsage: {
        totalTokens: 100,
      },
    });

    await assembleEval(tmpDir, {
      summary: 'Looks good',
      strengths: ['Met expectations'],
      weaknesses: [],
      observations: [],
      screenshots: [],
      criteriaChecks: [],
    });

    const runReport = JSON.parse(await fs.readFile(path.join(tmpDir, 'run-report.json'), 'utf-8'));
    expect(runReport.evaluationMode).toBe('scripted');
    expect(runReport.mechanicalScore).toBe(2);
  });
});
