import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../scripts/utils/process-utils.js', () => ({
  execAsync: vi.fn(),
}));

import { execAsync } from '../scripts/utils/process-utils.js';
import { isTaskRunBranch, getOpenPRs, getTaskRunBranches, closePR, deleteBranch } from '../scripts/cleanup-branches.js';

const REPO = 'skills-evals-bot/aem-boilerplate-evals';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isTaskRunBranch', () => {
  it('matches task-run branch patterns', () => {
    expect(isTaskRunBranch('claude-03151109-1')).toBe(true);
    expect(isTaskRunBranch('codex-03111407-12')).toBe(true);
    expect(isTaskRunBranch('cursor-03151109-3')).toBe(true);
    expect(isTaskRunBranch('my-agent-03151109-99')).toBe(true);
  });

  it('rejects non-task-run branches', () => {
    expect(isTaskRunBranch('main')).toBe(false);
    expect(isTaskRunBranch('feature/product-cards-block')).toBe(false);
    expect(isTaskRunBranch('develop')).toBe(false);
    expect(isTaskRunBranch('fix/something')).toBe(false);
    expect(isTaskRunBranch('claude-short-1')).toBe(false);
  });
});

describe('getOpenPRs', () => {
  it('returns parsed PR list from gh output', async () => {
    execAsync.mockResolvedValue({
      stdout: JSON.stringify([
        { number: 1, title: 'PR one', headRefName: 'claude-03151109-1' },
        { number: 2, title: 'PR two', headRefName: 'codex-03151109-2' },
      ]),
    });

    const prs = await getOpenPRs(REPO);

    expect(prs).toEqual([
      { number: 1, title: 'PR one', headRefName: 'claude-03151109-1' },
      { number: 2, title: 'PR two', headRefName: 'codex-03151109-2' },
    ]);
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining(`--repo ${REPO}`),
    );
  });

  it('returns empty array when no PRs', async () => {
    execAsync.mockResolvedValue({ stdout: '[]' });

    const prs = await getOpenPRs(REPO);
    expect(prs).toEqual([]);
  });
});

describe('getTaskRunBranches', () => {
  it('returns only branches matching task-run pattern', async () => {
    execAsync.mockResolvedValue({
      stdout: 'main\nclaude-03151109-1\nfeature/product-cards-block\ncodex-03151109-2\n',
    });

    const branches = await getTaskRunBranches(REPO);
    expect(branches).toEqual(['claude-03151109-1', 'codex-03151109-2']);
  });

  it('handles pagination by fetching multiple pages', async () => {
    const page1Names = Array.from({ length: 100 }, (_, i) => `agent-03151109-${i}`).join('\n') + '\n';
    const page2Names = 'agent-03151109-100\nmain\n';

    execAsync
      .mockResolvedValueOnce({ stdout: page1Names })
      .mockResolvedValueOnce({ stdout: page2Names });

    const branches = await getTaskRunBranches(REPO);
    expect(branches).toHaveLength(101);
    expect(branches).not.toContain('main');
  });

  it('returns empty when no task-run branches exist', async () => {
    execAsync.mockResolvedValue({
      stdout: 'main\nfeature/something\n',
    });

    const branches = await getTaskRunBranches(REPO);
    expect(branches).toEqual([]);
  });
});

describe('closePR', () => {
  it('calls gh pr close with correct args', async () => {
    execAsync.mockResolvedValue({ stdout: '' });

    await closePR(REPO, 42);

    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('gh pr close 42'),
    );
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining(`--repo ${REPO}`),
    );
  });
});

describe('deleteBranch', () => {
  it('calls gh api to delete branch ref', async () => {
    execAsync.mockResolvedValue({ stdout: '' });

    await deleteBranch(REPO, 'claude-03151109-1');

    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('git/refs/heads/claude-03151109-1'),
    );
  });
});
