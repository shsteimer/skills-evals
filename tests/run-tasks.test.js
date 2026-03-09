import { describe, it, expect } from 'vitest';
import { parseArgs, buildBatchMetadata } from '../scripts/run-tasks.js';

describe('parseArgs', () => {
  describe('task name filtering', () => {
    it('should parse single task name with --task flag', () => {
      const args = ['node', 'script.js', '--task', 'build-block'];
      const result = parseArgs(args);
      
      expect(result.tasks).toEqual(['build-block']);
    });

    it('should parse multiple task names with --task flag', () => {
      const args = ['node', 'script.js', '--task', 'build-block', '--task', 'deploy-service'];
      const result = parseArgs(args);
      
      expect(result.tasks).toEqual(['build-block', 'deploy-service']);
    });

    it('should parse comma-separated task names', () => {
      const args = ['node', 'script.js', '--task', 'build-block,deploy-service'];
      const result = parseArgs(args);
      
      expect(result.tasks).toEqual(['build-block', 'deploy-service']);
    });
  });

  describe('tag filtering', () => {
    it('should parse single tag with --tag flag', () => {
      const args = ['node', 'script.js', '--tag', 'cdd'];
      const result = parseArgs(args);
      
      expect(result.tags).toEqual(['cdd']);
    });

    it('should parse multiple tags with --tag flag', () => {
      const args = ['node', 'script.js', '--tag', 'cdd', '--tag', 'blocks'];
      const result = parseArgs(args);
      
      expect(result.tags).toEqual(['cdd', 'blocks']);
    });

    it('should parse comma-separated tags', () => {
      const args = ['node', 'script.js', '--tag', 'cdd,blocks'];
      const result = parseArgs(args);
      
      expect(result.tags).toEqual(['cdd', 'blocks']);
    });
  });

  describe('workspace location', () => {
    it('should parse workspace directory with --workspace flag', () => {
      const args = ['node', 'script.js', '--workspace', '/tmp/my-workspace'];
      const result = parseArgs(args);
      
      expect(result.workspaceDir).toBe('/tmp/my-workspace');
    });

    it('should use default workspace directory when not specified', () => {
      const args = ['node', 'script.js'];
      const result = parseArgs(args);
      
      expect(result.workspaceDir).toBeDefined();
      expect(result.workspaceDir).toContain('skills-evals-workspace');
    });
  });

  describe('combined arguments', () => {
    it('should parse multiple argument types together', () => {
      const args = [
        'node', 'script.js',
        '--task', 'build-block',
        '--tag', 'cdd',
        '--workspace', '/tmp/test'
      ];
      const result = parseArgs(args);
      
      expect(result.tasks).toEqual(['build-block']);
      expect(result.tags).toEqual(['cdd']);
      expect(result.workspaceDir).toBe('/tmp/test');
    });
  });

  describe('default values', () => {
    it('should return empty arrays when no filters specified', () => {
      const args = ['node', 'script.js'];
      const result = parseArgs(args);
      
      expect(result.tasks).toEqual([]);
      expect(result.tags).toEqual([]);
    });
  });

  describe('agents', () => {
    it('should use default agents when not specified', () => {
      const args = ['node', 'script.js'];
      const result = parseArgs(args);
      
      expect(result.agents).toEqual(['claude', 'cursor', 'codex']);
    });

    it('should parse single agent with --agents flag', () => {
      const args = ['node', 'script.js', '--agents', 'claude'];
      const result = parseArgs(args);
      
      expect(result.agents).toEqual(['claude']);
    });

    it('should parse multiple agents with --agents flag', () => {
      const args = ['node', 'script.js', '--agents', 'claude', '--agents', 'cursor'];
      const result = parseArgs(args);
      
      expect(result.agents).toEqual(['claude', 'cursor']);
    });

    it('should parse comma-separated agents', () => {
      const args = ['node', 'script.js', '--agents', 'claude,cursor,codex'];
      const result = parseArgs(args);
      
      expect(result.agents).toEqual(['claude', 'cursor', 'codex']);
    });
  });

  describe('help flag', () => {
    it('should set showHelp to true with --help flag', () => {
      const args = ['node', 'script.js', '--help'];
      const result = parseArgs(args);
      
      expect(result.showHelp).toBe(true);
    });

    it('should set showHelp to true with -h flag', () => {
      const args = ['node', 'script.js', '-h'];
      const result = parseArgs(args);
      
      expect(result.showHelp).toBe(true);
    });

    it('should not set showHelp when no help flag present', () => {
      const args = ['node', 'script.js', '--task', 'build-block'];
      const result = parseArgs(args);
      
      expect(result.showHelp).toBe(false);
    });
  });

  describe('times parameter', () => {
    it('should default to 1 when not specified', () => {
      const args = ['node', 'script.js'];
      const result = parseArgs(args);
      
      expect(result.times).toBe(1);
    });

    it('should parse times value with --times flag', () => {
      const args = ['node', 'script.js', '--times', '3'];
      const result = parseArgs(args);
      
      expect(result.times).toBe(3);
    });

    it('should throw error for non-numeric times value', () => {
      const args = ['node', 'script.js', '--times', 'abc'];
      
      expect(() => parseArgs(args)).toThrow('--times must be a positive integer');
    });

    it('should throw error for negative times value', () => {
      const args = ['node', 'script.js', '--times', '-1'];
      
      expect(() => parseArgs(args)).toThrow('--times must be a positive integer');
    });

    it('should throw error for zero times value', () => {
      const args = ['node', 'script.js', '--times', '0'];
      
      expect(() => parseArgs(args)).toThrow('--times must be a positive integer');
    });
  });
});

describe('buildBatchMetadata', () => {
  const baseArgs = {
    tasks: ['build-block'],
    tags: [],
    agents: ['claude'],
    times: 3,
    workspaceDir: '/tmp/workspace',
    augmentationsFile: 'augmentations/cdd.json'
  };

  const enrichedTasks = [
    { name: 'build-block', agent: 'claude', model: 'claude-sonnet-4-20250514', timestamp: '20260308-135305', iteration: 1, augmentationSetName: 'cdd-v1' },
    { name: 'build-block', agent: 'claude', model: 'claude-sonnet-4-20250514', timestamp: '20260308-135305', iteration: 2, augmentationSetName: 'cdd-v1' },
    { name: 'build-block', agent: 'claude', model: 'claude-sonnet-4-20250514', timestamp: '20260308-135305', iteration: 3, augmentationSetName: 'cdd-v1' }
  ];

  it('should produce correct shape with all required fields', () => {
    const result = buildBatchMetadata(
      baseArgs, enrichedTasks,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      false
    );

    expect(result).toMatchObject({
      timestamp: '20260308-135305',
      startedAt: '2026-03-08T13:53:05.000Z',
      finishedAt: '2026-03-08T13:59:02.000Z',
      augmentationSetName: 'cdd-v1',
      taskNames: ['build-block'],
      runCount: 3
    });
    expect(result.durationMs).toBe(357000);
    expect(result.agentModels).toEqual({ claude: 'claude-sonnet-4-20250514' });
  });

  it('should include args subset', () => {
    const result = buildBatchMetadata(
      baseArgs, enrichedTasks,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      false
    );

    expect(result.args).toEqual({
      tasks: ['build-block'],
      tags: [],
      agents: ['claude'],
      times: 3,
      workspaceDir: '/tmp/workspace',
      augmentationsFile: 'augmentations/cdd.json'
    });
  });

  it('should set augmentationSetName to null when no augmentation file', () => {
    const tasksNoAug = enrichedTasks.map(t => ({ ...t, augmentationSetName: null }));
    const result = buildBatchMetadata(
      { ...baseArgs, augmentationsFile: null }, tasksNoAug,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      false
    );

    expect(result.augmentationSetName).toBeNull();
  });

  it('should collect unique task names across multiple tasks', () => {
    const multiTasks = [
      { name: 'build-block', agent: 'claude', model: 'claude-sonnet-4-20250514', timestamp: '20260308-135305', iteration: 1, augmentationSetName: null },
      { name: 'fix-block-bug', agent: 'claude', model: 'claude-sonnet-4-20250514', timestamp: '20260308-135305', iteration: 1, augmentationSetName: null },
      { name: 'build-block', agent: 'cursor', model: null, timestamp: '20260308-135305', iteration: 1, augmentationSetName: null }
    ];

    const result = buildBatchMetadata(
      { ...baseArgs, agents: ['claude', 'cursor'] }, multiTasks,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      false
    );

    expect(result.taskNames).toEqual(['build-block', 'fix-block-bug']);
    expect(result.agentModels).toEqual({ claude: 'claude-sonnet-4-20250514', cursor: null });
  });

  it('should set completedCount to null when hasFailures is true', () => {
    const result = buildBatchMetadata(
      baseArgs, enrichedTasks,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      true
    );

    expect(result.failedCount).toBeNull();
    expect(result.completedCount).toBeNull();
  });

  it('should include timedOutRuns when provided', () => {
    const result = buildBatchMetadata(
      baseArgs, enrichedTasks,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      true,
      ['build-block-claude-2']
    );

    expect(result.timedOutRuns).toEqual(['build-block-claude-2']);
  });

  it('should default timedOutRuns to empty array when not provided', () => {
    const result = buildBatchMetadata(
      baseArgs, enrichedTasks,
      '2026-03-08T13:53:05.000Z', '2026-03-08T13:59:02.000Z',
      false
    );

    expect(result.timedOutRuns).toEqual([]);
  });
});

