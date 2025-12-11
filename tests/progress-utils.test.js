import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgressTracker, runInParallel } from '../scripts/utils/progress-utils.js';

describe('Progress Utilities', () => {
  let consoleOutput;
  let originalStdoutWrite;
  
  beforeEach(() => {
    consoleOutput = [];
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = vi.fn((str) => {
      consoleOutput.push(str);
      return true;
    });
  });
  
  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  describe('createProgressTracker', () => {
    it('should track task progress', () => {
      const getTaskId = (task) => task.id;
      const tracker = createProgressTracker(3, getTaskId);
      
      const task1 = { id: 'task-1' };
      const task2 = { id: 'task-2' };
      
      tracker.taskStarted(task1);
      tracker.taskStarted(task2);
      tracker.taskCompleted(task1);
      tracker.taskFailed(task2, new Error('Task failed'));
      
      expect(tracker.hasFailed()).toBe(true);
    });

    it('should not have failures when all tasks complete successfully', () => {
      const getTaskId = (task) => task.id;
      const tracker = createProgressTracker(2, getTaskId);
      
      const task1 = { id: 'task-1' };
      const task2 = { id: 'task-2' };
      
      tracker.taskStarted(task1);
      tracker.taskCompleted(task1);
      tracker.taskStarted(task2);
      tracker.taskCompleted(task2);
      
      expect(tracker.hasFailed()).toBe(false);
    });

    it('should update display when tasks start and complete', () => {
      const getTaskId = (task) => task.id;
      const tracker = createProgressTracker(1, getTaskId);
      
      const task = { id: 'task-1' };
      
      tracker.taskStarted(task);
      tracker.taskCompleted(task);
      
      // Should have written progress updates
      expect(process.stdout.write).toHaveBeenCalled();
    });
  });

  describe('runInParallel', () => {
    it('should run tasks in parallel with concurrency limit', async () => {
      const tasks = [
        { id: 'task-1' },
        { id: 'task-2' },
        { id: 'task-3' },
        { id: 'task-4' }
      ];
      
      const executedTasks = [];
      const processTask = vi.fn(async (task) => {
        await new Promise(resolve => {
          const timer = globalThis.setTimeout(resolve, 10);
          return timer;
        });
        executedTasks.push(task.id);
      });
      
      const getTaskId = (task) => task.id;
      
      await runInParallel(tasks, 2, processTask, getTaskId);
      
      expect(processTask).toHaveBeenCalledTimes(4);
      expect(executedTasks).toHaveLength(4);
    });

    it('should continue on task failure', async () => {
      const tasks = [
        { id: 'task-1' },
        { id: 'task-2' },
        { id: 'task-3' }
      ];
      
      const processTask = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Task 2 failed'))
        .mockResolvedValueOnce(undefined);
      
      const getTaskId = (task) => task.id;
      
      const hasFailures = await runInParallel(tasks, 2, processTask, getTaskId);
      
      expect(processTask).toHaveBeenCalledTimes(3);
      expect(hasFailures).toBe(true);
    });

    it('should return false when all tasks succeed', async () => {
      const tasks = [
        { id: 'task-1' },
        { id: 'task-2' }
      ];
      
      const processTask = vi.fn(async () => {});
      const getTaskId = (task) => task.id;
      
      const hasFailures = await runInParallel(tasks, 2, processTask, getTaskId);
      
      expect(hasFailures).toBe(false);
    });

    it('should handle empty task list', async () => {
      const tasks = [];
      const processTask = vi.fn(async () => {});
      const getTaskId = (task) => task.id;
      
      const hasFailures = await runInParallel(tasks, 2, processTask, getTaskId);
      
      expect(processTask).not.toHaveBeenCalled();
      expect(hasFailures).toBe(false);
    });

    it('should respect concurrency limit', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `task-${i}` }));
      
      let maxConcurrent = 0;
      let currentRunning = 0;
      
      const processTask = vi.fn(async () => {
        currentRunning++;
        maxConcurrent = Math.max(maxConcurrent, currentRunning);
        await new Promise(resolve => {
          const timer = globalThis.setTimeout(resolve, 10);
          return timer;
        });
        currentRunning--;
      });
      
      const getTaskId = (task) => task.id;
      
      await runInParallel(tasks, 3, processTask, getTaskId);
      
      expect(processTask).toHaveBeenCalledTimes(10);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(maxConcurrent).toBeGreaterThan(0);
    });
  });
});


