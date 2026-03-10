import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { resolveChecks } from '../scripts/resolve-checks.js';

describe('resolveChecks', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolve-checks-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeResultFile(name, data) {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.writeFile(path.join(tmpDir, name), content, 'utf-8');
  }

  it('uses criteria.txt from the result folder snapshot', async () => {
    await writeResultFile('task.json', {
      name: 'build-block',
      agent: 'claude',
      startFrom: 'https://github.com/example/repo',
    });
    await writeResultFile('criteria.txt', `## Snapshot Section
<critical>
- Snapshot-only criterion [check: snapshot-check]
</critical>
`);
    await writeResultFile('check-results.json', [
      {
        name: 'snapshot-check',
        description: 'Snapshot check',
        passed: true,
        evidence: 'Found in result folder snapshot',
      },
    ]);

    const result = await resolveChecks(tmpDir);

    expect(result.resolved).toEqual([
      expect.objectContaining({
        name: 'Snapshot-only criterion',
        section: 'Snapshot Section',
        priority: 'critical',
        met: true,
        points: 2,
      }),
    ]);
  });

  it('returns missing check-linked criteria as unresolved', async () => {
    await writeResultFile('task.json', {
      name: 'build-block',
      agent: 'claude',
      startFrom: 'https://github.com/example/repo',
    });
    await writeResultFile('criteria.txt', `## Checks
<critical>
- Files exist [check: files-exist]
- Browser proof exists [check: browser-proof]
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

    const result = await resolveChecks(tmpDir);

    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toEqual([
      expect.objectContaining({
        name: 'Browser proof exists',
        section: 'Checks',
        priority: 'critical',
        checkName: 'browser-proof',
      }),
    ]);
  });
});
