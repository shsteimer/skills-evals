import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { findTasks } from '../scripts/run-tasks.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testTasksDir = path.join(__dirname, 'fixtures', 'tasks');

describe('findTasks', () => {
  beforeAll(async () => {
    // Create test fixtures
    await fs.mkdir(path.join(testTasksDir, 'task-one'), { recursive: true });
    await fs.mkdir(path.join(testTasksDir, 'task-two'), { recursive: true });
    await fs.mkdir(path.join(testTasksDir, 'task-three'), { recursive: true });

    // task-one: tags=['web', 'frontend']
    await fs.writeFile(
      path.join(testTasksDir, 'task-one', 'task.json'),
      JSON.stringify({
        name: 'task-one',
        description: 'First test task',
        tags: ['web', 'frontend']
      })
    );
    await fs.writeFile(
      path.join(testTasksDir, 'task-one', 'prompt.txt'),
      'Build a web component'
    );
    await fs.writeFile(
      path.join(testTasksDir, 'task-one', 'criteria.txt'),
      'Component must render'
    );

    // task-two: tags=['backend', 'api']
    await fs.writeFile(
      path.join(testTasksDir, 'task-two', 'task.json'),
      JSON.stringify({
        name: 'task-two',
        description: 'Second test task',
        tags: ['backend', 'api']
      })
    );
    await fs.writeFile(
      path.join(testTasksDir, 'task-two', 'prompt.txt'),
      'Build an API endpoint'
    );
    await fs.writeFile(
      path.join(testTasksDir, 'task-two', 'criteria.txt'),
      'Endpoint must respond'
    );

    // task-three: tags=['web', 'backend']
    await fs.writeFile(
      path.join(testTasksDir, 'task-three', 'task.json'),
      JSON.stringify({
        name: 'task-three',
        description: 'Third test task',
        tags: ['web', 'backend']
      })
    );
    await fs.writeFile(
      path.join(testTasksDir, 'task-three', 'prompt.txt'),
      'Build a full stack app'
    );
    await fs.writeFile(
      path.join(testTasksDir, 'task-three', 'criteria.txt'),
      'App must be functional'
    );
  });

  afterAll(async () => {
    // Clean up test fixtures
    await fs.rm(testTasksDir, { recursive: true, force: true });
  });

  describe('with no filters', () => {
    it('should return all tasks', async () => {
      const args = { tasks: [], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.name).sort()).toEqual(['task-one', 'task-three', 'task-two']);
    });

    it('should include all task.json properties', async () => {
      const args = { tasks: [], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      const taskOne = tasks.find(t => t.name === 'task-one');
      expect(taskOne.name).toBe('task-one');
      expect(taskOne.description).toBe('First test task');
      expect(taskOne.tags).toEqual(['web', 'frontend']);
    });

    it('should include taskPath', async () => {
      const args = { tasks: [], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      const taskOne = tasks.find(t => t.name === 'task-one');
      expect(taskOne.taskPath).toBe(path.join(testTasksDir, 'task-one'));
    });

    it('should include prompt content', async () => {
      const args = { tasks: [], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      const taskOne = tasks.find(t => t.name === 'task-one');
      expect(taskOne.prompt).toBe('Build a web component');
    });

    it('should include criteria content', async () => {
      const args = { tasks: [], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      const taskOne = tasks.find(t => t.name === 'task-one');
      expect(taskOne.criteria).toBe('Component must render');
    });
  });

  describe('filtering by task name', () => {
    it('should return only specified task', async () => {
      const args = { tasks: ['task-one'], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('task-one');
    });

    it('should return multiple specified tasks', async () => {
      const args = { tasks: ['task-one', 'task-three'], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.name).sort()).toEqual(['task-one', 'task-three']);
    });

    it('should return empty array for non-existent task', async () => {
      const args = { tasks: ['non-existent'], tags: [] };
      const tasks = await findTasks(args, testTasksDir);

      expect(tasks).toHaveLength(0);
    });
  });

  describe('filtering by tags', () => {
    it('should return tasks with specified tag', async () => {
      const args = { tasks: [], tags: ['web'] };
      const tasks = await findTasks(args, testTasksDir);

      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.name).sort()).toEqual(['task-one', 'task-three']);
    });

    it('should return tasks matching any specified tags (OR logic)', async () => {
      const args = { tasks: [], tags: ['frontend', 'backend'] };
      const tasks = await findTasks(args, testTasksDir);

      // task-one has 'frontend', task-two has 'backend', task-three has 'backend'
      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.name).sort()).toEqual(['task-one', 'task-three', 'task-two']);
    });

    it('should return empty array when no tasks match tags', async () => {
      const args = { tasks: [], tags: ['nonexistent'] };
      const tasks = await findTasks(args, testTasksDir);

      expect(tasks).toHaveLength(0);
    });
  });

  describe('filtering by both name and tags', () => {
    it('should throw error when both task names and tags are specified', async () => {
      const args = { tasks: ['task-one'], tags: ['web'] };
      
      await expect(findTasks(args, testTasksDir)).rejects.toThrow(
        'Cannot specify both task names and tags. Use one or the other.'
      );
    });

    it('should throw error when both task names and tags have multiple values', async () => {
      const args = { tasks: ['task-one', 'task-two'], tags: ['web', 'backend'] };
      
      await expect(findTasks(args, testTasksDir)).rejects.toThrow(
        'Cannot specify both task names and tags. Use one or the other.'
      );
    });
  });

  describe('global augmentations', () => {
    afterEach(async () => {
      // Clean up test augmentations file if it exists
      const globalAugPath = path.join(process.cwd(), 'test-augmentations.json');
      await fs.unlink(globalAugPath).catch(() => {});
    });

    it('should load global augmentations when file is specified', async () => {
      const globalAugPath = path.join(process.cwd(), 'test-augmentations.json');
      const globalAugs = [
        { source: 'global1.txt', target: 'global1.txt' },
        { source: 'global2.txt', target: 'global2.txt' }
      ];
      
      await fs.writeFile(globalAugPath, JSON.stringify(globalAugs, null, 2));
      
      const args = { tasks: [], tags: [], agents: [], augmentationsFile: globalAugPath };
      const tasks = await findTasks(args, testTasksDir);
      
      // All tasks should have global augmentations
      for (const task of tasks) {
        expect(task.augmentations).toBeDefined();
        expect(task.augmentations.length).toBeGreaterThanOrEqual(2);
        expect(task.augmentations[0].source).toBe('global1.txt');
        expect(task.augmentations[1].source).toBe('global2.txt');
      }
      
      // Clean up
      await fs.unlink(globalAugPath);
    });

    it('should combine global and task-specific augmentations', async () => {
      const globalAugPath = path.join(process.cwd(), 'test-augmentations.json');
      const globalAugs = [{ source: 'global.txt', target: 'global.txt' }];
      
      await fs.writeFile(globalAugPath, JSON.stringify(globalAugs, null, 2));
      
      const args = { tasks: [], tags: [], agents: [], augmentationsFile: globalAugPath };
      const tasks = await findTasks(args, testTasksDir);
      
      // Global augmentations should come first
      for (const task of tasks) {
        expect(task.augmentations[0].source).toBe('global.txt');
      }
      
      // Clean up
      await fs.unlink(globalAugPath);
    });

    it('should work without global augmentations file', async () => {
      const args = { tasks: [], tags: [], agents: [] };
      const tasks = await findTasks(args, testTasksDir);
      
      // Should still work fine without augmentations.json
      expect(tasks.length).toBeGreaterThan(0);
    });

    it('should throw error if augmentations file is not an array', async () => {
      const globalAugPath = path.join(process.cwd(), 'test-augmentations.json');
      await fs.writeFile(globalAugPath, JSON.stringify({ source: 'test.txt' }));
      
      const args = { tasks: [], tags: [], agents: [], augmentationsFile: globalAugPath };
      
      await expect(findTasks(args, testTasksDir)).rejects.toThrow(
        'Augmentations file must contain an array'
      );
      
      // Clean up
      await fs.unlink(globalAugPath).catch(() => {});
    });
  });
});

