import { describe, it, expect } from 'vitest';
import { diffAugmentations } from '../scripts/assemble-compare-prompt.js';

describe('diffAugmentations', () => {
  it('should identify identical augmentation sets as no changes', () => {
    const baseline = {
      augmentationSetName: 'Set A',
      args: {
        augmentationsFiles: ['/path/to/aug1.json'],
      },
    };
    const candidate = {
      augmentationSetName: 'Set A',
      args: {
        augmentationsFiles: ['/path/to/aug1.json'],
      },
    };
    const augFiles = {
      '/path/to/aug1.json': {
        name: 'Aug 1',
        augmentations: [{ source: 'http://example.com/file.md', target: 'AGENTS.md' }],
      },
    };

    const diff = diffAugmentations(baseline, candidate, augFiles);
    expect(diff.setNameChanged).toBe(false);
    expect(diff.filesAdded).toEqual([]);
    expect(diff.filesRemoved).toEqual([]);
    expect(diff.filesChanged).toEqual([]);
    expect(diff.filesUnchanged).toHaveLength(1);
  });

  it('should detect added augmentation files', () => {
    const baseline = {
      augmentationSetName: 'Set A',
      args: { augmentationsFiles: ['/path/to/aug1.json'] },
    };
    const candidate = {
      augmentationSetName: 'Set A + B',
      args: { augmentationsFiles: ['/path/to/aug1.json', '/path/to/aug2.json'] },
    };
    const augFiles = {
      '/path/to/aug1.json': {
        name: 'Aug 1',
        augmentations: [{ source: 'src1', target: 'AGENTS.md' }],
      },
      '/path/to/aug2.json': {
        name: 'Aug 2',
        augmentations: [{ source: 'src2', target: 'CLAUDE.md' }],
      },
    };

    const diff = diffAugmentations(baseline, candidate, augFiles);
    expect(diff.setNameChanged).toBe(true);
    expect(diff.filesAdded).toHaveLength(1);
    expect(diff.filesAdded[0].path).toBe('/path/to/aug2.json');
    expect(diff.filesAdded[0].content.name).toBe('Aug 2');
    expect(diff.filesRemoved).toEqual([]);
  });

  it('should detect removed augmentation files', () => {
    const baseline = {
      augmentationSetName: 'Set A + B',
      args: { augmentationsFiles: ['/path/to/aug1.json', '/path/to/aug2.json'] },
    };
    const candidate = {
      augmentationSetName: 'Set A',
      args: { augmentationsFiles: ['/path/to/aug1.json'] },
    };
    const augFiles = {
      '/path/to/aug1.json': {
        name: 'Aug 1',
        augmentations: [{ source: 'src1', target: 'AGENTS.md' }],
      },
      '/path/to/aug2.json': {
        name: 'Aug 2',
        augmentations: [{ source: 'src2', target: 'CLAUDE.md' }],
      },
    };

    const diff = diffAugmentations(baseline, candidate, augFiles);
    expect(diff.filesRemoved).toHaveLength(1);
    expect(diff.filesRemoved[0].path).toBe('/path/to/aug2.json');
  });

  it('should detect changed augmentation files by comparing content', () => {
    const baseline = {
      augmentationSetName: 'Set A',
      args: { augmentationsFiles: ['/path/to/aug1.json'] },
    };
    const candidate = {
      augmentationSetName: 'Set B',
      args: { augmentationsFiles: ['/path/to/aug1-v2.json'] },
    };
    const augFiles = {
      '/path/to/aug1.json': {
        name: 'AEM Boilerplate Baseline',
        augmentations: [
          { source: 'http://example.com/main/AGENTS.md', target: 'AGENTS.md' },
          { source: 'http://example.com/main/CLAUDE.md', target: 'CLAUDE.md' },
        ],
      },
      '/path/to/aug1-v2.json': {
        name: 'AEM Boilerplate Candidate',
        augmentations: [
          { source: 'http://example.com/pr/594/AGENTS.md', target: 'AGENTS.md' },
          { source: 'http://example.com/pr/594/CLAUDE.md', target: 'CLAUDE.md' },
        ],
      },
    };

    const diff = diffAugmentations(baseline, candidate, augFiles);
    expect(diff.setNameChanged).toBe(true);
    expect(diff.filesChanged).toHaveLength(2);
    const agentsDiff = diff.filesChanged.find((c) => c.target === 'AGENTS.md');
    expect(agentsDiff.baselineSource).toBe('http://example.com/main/AGENTS.md');
    expect(agentsDiff.candidateSource).toBe('http://example.com/pr/594/AGENTS.md');
    const claudeDiff = diff.filesChanged.find((c) => c.target === 'CLAUDE.md');
    expect(claudeDiff.baselineSource).toBe('http://example.com/main/CLAUDE.md');
    expect(claudeDiff.candidateSource).toBe('http://example.com/pr/594/CLAUDE.md');
  });

  it('should match augmentations across files by target path', () => {
    const baseline = {
      augmentationSetName: 'Set A',
      args: { augmentationsFiles: ['/path/to/base.json'] },
    };
    const candidate = {
      augmentationSetName: 'Set B',
      args: { augmentationsFiles: ['/path/to/cand.json'] },
    };
    const augFiles = {
      '/path/to/base.json': {
        name: 'Base',
        augmentations: [
          { source: 'src-a', target: 'AGENTS.md' },
          { source: 'src-b', target: 'tools/config.json' },
        ],
      },
      '/path/to/cand.json': {
        name: 'Candidate',
        augmentations: [
          { source: 'src-a-v2', target: 'AGENTS.md' },
          { source: 'src-c', target: 'new-file.md' },
        ],
      },
    };

    const diff = diffAugmentations(baseline, candidate, augFiles);
    // AGENTS.md changed source
    expect(diff.filesChanged).toHaveLength(1);
    expect(diff.filesChanged[0].target).toBe('AGENTS.md');
    // tools/config.json removed
    expect(diff.targetsRemoved).toHaveLength(1);
    expect(diff.targetsRemoved[0].target).toBe('tools/config.json');
    // new-file.md added
    expect(diff.targetsAdded).toHaveLength(1);
    expect(diff.targetsAdded[0].target).toBe('new-file.md');
  });

  it('should handle missing augmentationsFiles gracefully', () => {
    const baseline = {
      augmentationSetName: 'Set A',
      args: {},
    };
    const candidate = {
      augmentationSetName: 'Set B',
      args: { augmentationsFiles: ['/path/to/aug1.json'] },
    };
    const augFiles = {
      '/path/to/aug1.json': {
        name: 'Aug 1',
        augmentations: [{ source: 'src1', target: 'AGENTS.md' }],
      },
    };

    const diff = diffAugmentations(baseline, candidate, augFiles);
    expect(diff.filesAdded).toHaveLength(1);
    expect(diff.filesRemoved).toEqual([]);
  });

  it('should handle unreadable augmentation files', () => {
    const baseline = {
      augmentationSetName: 'Set A',
      args: { augmentationsFiles: ['/path/to/missing.json'] },
    };
    const candidate = {
      augmentationSetName: 'Set A',
      args: { augmentationsFiles: ['/path/to/missing.json'] },
    };
    // augFiles doesn't contain the path — simulates unreadable file
    const augFiles = {};

    const diff = diffAugmentations(baseline, candidate, augFiles);
    expect(diff.unreadable).toContain('/path/to/missing.json');
  });
});
