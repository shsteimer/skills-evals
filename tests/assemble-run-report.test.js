import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { assembleRunReport } from '../scripts/assemble-run-report.js';

describe('assembleRunReport', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assemble-run-report-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeResultFile(name, data) {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.writeFile(path.join(tmpDir, name), content, 'utf-8');
  }

  it('writes run-report artifacts with mechanical scoring and activity summary', async () => {
    await writeResultFile('task.json', {
      name: 'build-block',
      agent: 'claude',
      model: 'sonnet',
      iteration: 2,
      timestamp: '20260310-120000',
      startFrom: 'https://github.com/example/repo',
    });
    await writeResultFile('criteria.txt', `## Implementation
<critical>
- Block files exist [check: files-exist]
- Browser verification exists [check: browser-proof]
</critical>
<important>
- Lint passes [check: lint-passes]
</important>
`);
    await writeResultFile('check-results.json', [
      {
        name: 'files-exist',
        description: 'Block files exist',
        passed: true,
        evidence: 'Found JS and CSS files',
      },
      {
        name: 'lint-passes',
        description: 'Lint passes',
        passed: false,
        evidence: '2 lint errors remain',
      },
    ]);
    await writeResultFile('run-metrics.json', {
      durationMs: 42000,
      timedOut: false,
      tokenUsage: {
        totalTokens: 1234,
      },
    });
    await writeResultFile('test-results.json', {
      passed: true,
      exitCode: 0,
    });
    await writeResultFile('commits.json', [
      { hash: 'abc1234', message: 'Initial implementation' },
      { hash: 'def5678', message: 'Fix lint issues' },
    ]);
    await writeResultFile('changes.diff', `diff --git a/blocks/foo.js b/blocks/foo.js
++ b/blocks/foo.js
console.log("hi");
`);
    await writeResultFile('output.jsonl', [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Investigating the block setup.' },
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'blocks/foo.js' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 42000,
        num_turns: 6,
      }),
    ].join('\n'));

    const report = await assembleRunReport(tmpDir);

    expect(report.evaluationMode).toBe('scripted');
    expect(report.mechanicalScore).toBe(2);
    expect(report.mechanicalMaxScore).toBe(3);
    expect(report.resolvedCriteriaCount).toBe(2);
    expect(report.unresolvedCriteriaCount).toBe(1);
    expect(report.activitySummary.toolCalls).toBe(1);
    expect(report.git.commitCount).toBe(2);

    const runReportJson = JSON.parse(await fs.readFile(path.join(tmpDir, 'run-report.json'), 'utf-8'));
    expect(runReportJson.mechanicalScore).toBe(2);

    const runReportData = await fs.readFile(path.join(tmpDir, 'run-report-data.js'), 'utf-8');
    expect(runReportData).toMatch(/^const runReportData = /);
  });

  it('adds warnings for timeout, missing commits, missing diff, and check script errors', async () => {
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
        name: 'checks-script-error',
        description: 'Checks script failed',
        passed: false,
        evidence: 'node exited with status 1',
      },
    ]);
    await writeResultFile('run-metrics.json', {
      timedOut: true,
      durationMs: 60000,
      tokenUsage: {
        totalTokens: 500,
      },
    });

    const report = await assembleRunReport(tmpDir);

    expect(report.warnings).toEqual(expect.arrayContaining([
      'timed-out',
      'checks-script-error',
      'no-commits',
      'no-diff',
    ]));
  });
});
