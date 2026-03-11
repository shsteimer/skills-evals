import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reconstructWorkspace } from '../scripts/reconstruct-workspace.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: vi.fn(),
    exec: vi.fn()
  };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'reconstruct');
const projectRoot = path.join(__dirname, '..');

// Helper to create a mock result folder
async function createMockResultFolder(dir, overrides = {}) {
  await fs.mkdir(dir, { recursive: true });

  const taskJson = {
    name: 'build-block',
    description: 'Build a product cards grid block',
    startFrom: 'https://github.com/shsteimer/aem-boilerplate-evals',
    augmentations: [],
    agent: 'claude',
    timestamp: '20260308-135305',
    ...overrides
  };

  await fs.writeFile(
    path.join(dir, 'task.json'),
    JSON.stringify(taskJson, null, 2),
    'utf-8'
  );

  await fs.writeFile(
    path.join(dir, 'criteria.txt'),
    '# Success Criteria\n\n<critical>\n- Some criterion\n</critical>',
    'utf-8'
  );

  await fs.writeFile(
    path.join(dir, 'changes.diff'),
    'diff --git a/blocks/test/test.js b/blocks/test/test.js\nnew file mode 100644\nindex 0000000..1234567\n--- /dev/null\n+++ b/blocks/test/test.js\n@@ -0,0 +1 @@\n+export default function decorate() {}\n',
    'utf-8'
  );

  return taskJson;
}

// Helper to mock git clone — creates a minimal workspace
const mockGitClone = () => {
  execSync.mockImplementation((cmd) => {
    if (cmd.includes('git clone')) {
      const match = cmd.match(/git clone[^"]*"([^"]+)"/);
      if (match) {
        const targetDir = match[1];
        const fsSync = require('fs');
        fsSync.mkdirSync(path.join(targetDir, '.git'), { recursive: true });
        fsSync.writeFileSync(path.join(targetDir, 'README.md'), '# Test Repo');
      }
    }
    // git apply, git add, git commit — all no-ops
    return Buffer.from('');
  });
};

describe('reconstructWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGitClone();
  });

  afterEach(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  it('should return a workspace path in temp directory', async () => {
    const resultDir = path.join(fixturesDir, 'build-block-claude-1');
    await createMockResultFolder(resultDir);

    const workspacePath = await reconstructWorkspace(resultDir);

    expect(workspacePath).toContain('.eval-workspaces');
    expect(workspacePath).toContain(path.join('20260308-135305', 'build-block-claude-1'));

    // Clean up workspace
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should clone the startFrom repo', async () => {
    const resultDir = path.join(fixturesDir, 'build-block-claude-2');
    await createMockResultFolder(resultDir);

    const workspacePath = await reconstructWorkspace(resultDir);

    // Verify git clone was called with the right URL
    const cloneCalls = execSync.mock.calls.filter(
      ([cmd]) => typeof cmd === 'string' && cmd.includes('git clone')
    );
    expect(cloneCalls.length).toBe(1);
    expect(cloneCalls[0][0]).toContain('shsteimer/aem-boilerplate-evals.git');

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should apply changes.diff via git apply', async () => {
    const resultDir = path.join(fixturesDir, 'build-block-claude-3');
    await createMockResultFolder(resultDir);

    const workspacePath = await reconstructWorkspace(resultDir);

    // Verify git apply was called
    const applyCalls = execSync.mock.calls.filter(
      ([cmd]) => typeof cmd === 'string' && cmd.includes('git apply')
    );
    expect(applyCalls.length).toBe(1);

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should commit workspace setup before applying diff', async () => {
    const resultDir = path.join(fixturesDir, 'build-block-claude-4');
    await createMockResultFolder(resultDir);

    const workspacePath = await reconstructWorkspace(resultDir);

    // Verify ordering: git add + commit happen before git apply
    const allCmds = execSync.mock.calls.map(([cmd]) => cmd);
    const addIdx = allCmds.findIndex(c => c.includes('git add'));
    const commitIdx = allCmds.findIndex(c => c.includes('git commit'));
    const applyIdx = allCmds.findIndex(c => c.includes('git apply'));

    expect(addIdx).toBeLessThan(applyIdx);
    expect(commitIdx).toBeLessThan(applyIdx);

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should throw if task.json is missing startFrom', async () => {
    const resultDir = path.join(fixturesDir, 'bad-task');
    await createMockResultFolder(resultDir, { startFrom: undefined });

    await expect(reconstructWorkspace(resultDir)).rejects.toThrow('missing startFrom');

    // No workspace to clean up since it should fail before creation
  });

  it('should handle missing changes.diff gracefully', async () => {
    const resultDir = path.join(fixturesDir, 'no-diff');
    await createMockResultFolder(resultDir);
    // Remove the diff file
    await fs.unlink(path.join(resultDir, 'changes.diff'));

    const workspacePath = await reconstructWorkspace(resultDir);

    // Should succeed — no diff to apply
    const applyCalls = execSync.mock.calls.filter(
      ([cmd]) => typeof cmd === 'string' && cmd.includes('git apply')
    );
    expect(applyCalls.length).toBe(0);

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should parse branch from startFrom URL', async () => {
    const resultDir = path.join(fixturesDir, 'with-branch');
    await createMockResultFolder(resultDir, {
      startFrom: 'https://github.com/org/repo/tree/develop'
    });

    const workspacePath = await reconstructWorkspace(resultDir);

    const cloneCalls = execSync.mock.calls.filter(
      ([cmd]) => typeof cmd === 'string' && cmd.includes('git clone')
    );
    expect(cloneCalls[0][0]).toContain('--branch develop');

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should scope reconstructed workspaces by batch timestamp', async () => {
    const resultDir = path.join(fixturesDir, 'build-block-claude-1');
    await createMockResultFolder(resultDir, {
      timestamp: '20260308-135305'
    });

    const workspacePath = await reconstructWorkspace(resultDir);

    expect(workspacePath).toBe(
      path.join(projectRoot, '.eval-workspaces', '20260308-135305', 'build-block-claude-1')
    );

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should use branch-based reconstruction when branchName is present', async () => {
    const resultDir = path.join(fixturesDir, 'branch-recon');
    await createMockResultFolder(resultDir, {
      branchName: 'claude-0308-1353-1'
    });

    const workspacePath = await reconstructWorkspace(resultDir);

    // Should clone the repo, fetch the branch, and checkout
    const allCmds = execSync.mock.calls.map(([cmd]) => cmd);
    const fetchCmd = allCmds.find(c => c.includes('git fetch origin claude-0308-1353-1'));
    const checkoutCmd = allCmds.find(c => c.includes('git checkout claude-0308-1353-1'));
    expect(fetchCmd).toBeDefined();
    expect(checkoutCmd).toBeDefined();

    // Should NOT apply diff (branch has everything)
    const applyCalls = allCmds.filter(c => c.includes('git apply'));
    expect(applyCalls).toHaveLength(0);

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should fall back to diff reconstruction when branch fetch fails', async () => {
    const resultDir = path.join(fixturesDir, 'branch-fail');
    await createMockResultFolder(resultDir, {
      branchName: 'nonexistent-branch'
    });

    // Make fetch fail
    const originalImpl = execSync.getMockImplementation();
    execSync.mockImplementation((cmd, opts) => {
      if (cmd.includes('git fetch origin nonexistent-branch')) {
        throw new Error('branch not found');
      }
      return originalImpl(cmd, opts);
    });

    const workspacePath = await reconstructWorkspace(resultDir);

    // Should fall back and apply diff
    const allCmds = execSync.mock.calls.map(([cmd]) => cmd);
    const applyCalls = allCmds.filter(c => c.includes('git apply'));
    expect(applyCalls.length).toBe(1);

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should use diff reconstruction when branchName is absent', async () => {
    const resultDir = path.join(fixturesDir, 'no-branch');
    await createMockResultFolder(resultDir);
    // Default createMockResultFolder doesn't set branchName

    const workspacePath = await reconstructWorkspace(resultDir);

    // Should use diff path — no fetch
    const allCmds = execSync.mock.calls.map(([cmd]) => cmd);
    const fetchCalls = allCmds.filter(c => c.includes('git fetch'));
    expect(fetchCalls).toHaveLength(0);

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('should replay scripted augmentations recorded in task.json', async () => {
    const resultDir = path.join(fixturesDir, 'with-scripted-augmentation');
    const scriptPath = path.join(projectRoot, 'tests', 'fixtures', 'reconstruct-scripted-augmentation.mjs');

    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(
      scriptPath,
      `import fs from 'fs/promises';
import path from 'path';

export default {
  name: 'Replay Test',
  async augment({ workspaceDir }) {
    await fs.writeFile(path.join(workspaceDir, 'scripted.txt'), 'Scripted content', 'utf-8');
  }
};
`,
      'utf-8'
    );

    await createMockResultFolder(resultDir, {
      scriptedAugmentations: [
        { name: 'Replay Test', path: scriptPath }
      ]
    });

    const workspacePath = await reconstructWorkspace(resultDir);
    const scriptedContent = await fs.readFile(path.join(workspacePath, 'scripted.txt'), 'utf-8');

    expect(scriptedContent).toBe('Scripted content');

    await fs.rm(workspacePath, { recursive: true, force: true });
    await fs.rm(scriptPath, { force: true });
  });
});
