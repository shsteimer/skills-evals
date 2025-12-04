import { describe, it, expect } from 'vitest';
import { enrichTasks } from '../scripts/run-tasks.js';

describe('enrichTasks', () => {
  describe('basic enrichment', () => {
    it('should enrich single task with single agent', () => {
      const tasks = [{ name: 'build-block', description: 'Test task' }];
      const agents = ['claude'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].name).toBe('build-block');
      expect(enriched[0].description).toBe('Test task');
      expect(enriched[0].agent).toBe('claude');
      expect(enriched[0].timestamp).toMatch(/^\d{8}-\d{6}$/);
    });

    it('should preserve all original task properties', () => {
      const tasks = [{
        name: 'build-block',
        description: 'Test task',
        tags: ['cdd', 'blocks'],
        startFrom: { org: 'example', repo: 'test', branch: 'main' }
      }];
      const agents = ['claude'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched[0].name).toBe('build-block');
      expect(enriched[0].description).toBe('Test task');
      expect(enriched[0].tags).toEqual(['cdd', 'blocks']);
      expect(enriched[0].startFrom).toEqual({ org: 'example', repo: 'test', branch: 'main' });
    });
  });

  describe('multiple agents', () => {
    it('should create one enriched task per agent', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['claude', 'cursor', 'codex'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched).toHaveLength(3);
      expect(enriched[0].agent).toBe('claude');
      expect(enriched[1].agent).toBe('cursor');
      expect(enriched[2].agent).toBe('codex');
    });

    it('should sanitize agent names in folder paths', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['claude sonnet'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      // Spaces should be replaced with hyphens
      expect(enriched[0].taskInfoFolder).toContain('build-block-claude-sonnet');
      expect(enriched[0].workspaceDir).toContain('build-block-claude-sonnet');
    });
  });

  describe('multiple tasks', () => {
    it('should create enriched tasks for all task/agent combinations', () => {
      const tasks = [
        { name: 'build-block' },
        { name: 'deploy-service' }
      ];
      const agents = ['claude', 'cursor'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched).toHaveLength(4);
      expect(enriched[0].name).toBe('build-block');
      expect(enriched[0].agent).toBe('claude');
      expect(enriched[1].name).toBe('build-block');
      expect(enriched[1].agent).toBe('cursor');
      expect(enriched[2].name).toBe('deploy-service');
      expect(enriched[2].agent).toBe('claude');
      expect(enriched[3].name).toBe('deploy-service');
      expect(enriched[3].agent).toBe('cursor');
    });
  });

  describe('taskInfoFolder path', () => {
    it('should set taskInfoFolder with correct structure', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['claude'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched[0].taskInfoFolder).toContain('/results/');
      expect(enriched[0].taskInfoFolder).toMatch(/\/\d{8}-\d{6}\//);
      expect(enriched[0].taskInfoFolder).toContain('build-block-claude');
    });

    it('should include sanitized agent name in taskInfoFolder', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['agent/v2.0'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched[0].taskInfoFolder).toContain('build-block-agentv20');
      expect(enriched[0].taskInfoFolder).not.toContain('agent/v2.0');
    });
  });

  describe('workspaceDir path', () => {
    it('should set workspaceDir with correct structure', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['claude'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched[0].workspaceDir).toContain('/tmp/workspace/');
      expect(enriched[0].workspaceDir).toMatch(/\/\d{8}-\d{6}\//);
      expect(enriched[0].workspaceDir).toContain('build-block-claude');
    });

    it('should include sanitized agent name in workspaceDir', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['agent/v2.0'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched[0].workspaceDir).toContain('build-block-agentv20');
      expect(enriched[0].workspaceDir).not.toContain('agent/v2.0');
    });
  });

  describe('timestamp consistency', () => {
    it('should use same timestamp for all enriched tasks', () => {
      const tasks = [
        { name: 'build-block' },
        { name: 'deploy-service' }
      ];
      const agents = ['claude', 'cursor'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      // All tasks should have the same timestamp
      const firstTimestamp = enriched[0].timestamp;
      enriched.forEach(task => {
        expect(task.timestamp).toBe(firstTimestamp);
        expect(task.taskInfoFolder).toContain(firstTimestamp);
        expect(task.workspaceDir).toContain(firstTimestamp);
      });
    });

    it('should generate timestamp in correct format', () => {
      const tasks = [{ name: 'build-block' }];
      const agents = ['claude'];
      const workspaceDir = '/tmp/workspace';

      const enriched = enrichTasks(tasks, agents, workspaceDir);

      expect(enriched[0].timestamp).toMatch(/^\d{8}-\d{6}$/);
    });
  });
});

