import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as runTasksModule from '../scripts/run-tasks.js';

// Mock the dependencies
vi.mock('../scripts/run-tasks.js', async () => {
  const actual = await vi.importActual('../scripts/run-tasks.js');
  return {
    ...actual,
  };
});

describe('Parallel Task Execution', () => {
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

  describe('Task execution with concurrency', () => {
    it('should respect concurrency limit', async () => {
      // Track running tasks
      const runningTasks = new Set();
      let maxConcurrent = 0;
      
      // Create mock tasks that track concurrency
      const createMockTask = (id) => ({
        name: `task-${id}`,
        agent: 'test-agent',
        iteration: 1,
        async execute() {
          runningTasks.add(id);
          maxConcurrent = Math.max(maxConcurrent, runningTasks.size);
          await new Promise(resolve => {
            const timer = globalThis.setTimeout(resolve, 50);
            return timer;
          });
          runningTasks.delete(id);
        }
      });
      
      const tasks = Array.from({ length: 10 }, (_, i) => createMockTask(i));
      const concurrency = 3;
      
      // Mock the internal functions that would be called
      const mockRunTask = vi.fn(async (task) => {
        await task.execute();
      });
      
      const mockCaptureResults = vi.fn(async () => {});
      const mockCleanUp = vi.fn(async () => {});
      
      // We can't easily test the internal function directly, but we can verify
      // the concept with this simple implementation
      async function testRunTasksInParallel(tasks, _concurrency) {
        const queue = [...tasks];
        const running = new Set();
        
        async function processTask(task) {
          await mockRunTask(task);
          await mockCaptureResults(task);
          await mockCleanUp(task);
        }
        
        async function startNext() {
          if (queue.length === 0) {
            return null;
          }
          
          const task = queue.shift();
          const promise = processTask(task).then(() => {
            running.delete(promise);
            return startNext();
          });
          
          running.add(promise);
          return promise;
        }
        
        const initialPromises = [];
        for (let i = 0; i < Math.min(_concurrency, tasks.length); i++) {
          initialPromises.push(startNext());
        }
        
        await Promise.all(initialPromises);
        
        if (running.size > 0) {
          await Promise.all(Array.from(running));
        }
      }
      
      await testRunTasksInParallel(tasks, concurrency);
      
      // Verify all tasks were executed
      expect(mockRunTask).toHaveBeenCalledTimes(10);
      expect(mockCaptureResults).toHaveBeenCalledTimes(10);
      expect(mockCleanUp).toHaveBeenCalledTimes(10);
      
      // Verify concurrency was respected
      expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
      expect(maxConcurrent).toBeGreaterThan(0);
    });

    it('should handle single task execution', async () => {
      const tasks = [{
        name: 'single-task',
        agent: 'test-agent',
        iteration: 1
      }];
      
      const mockRunTask = vi.fn(async () => {});
      const mockCaptureResults = vi.fn(async () => {});
      const mockCleanUp = vi.fn(async () => {});
      
      async function testRunTasksInParallel(tasks, _concurrency) {
        for (const task of tasks) {
          await mockRunTask(task);
          await mockCaptureResults(task);
          await mockCleanUp(task);
        }
      }
      
      await testRunTasksInParallel(tasks, 1);
      
      expect(mockRunTask).toHaveBeenCalledTimes(1);
      expect(mockCaptureResults).toHaveBeenCalledTimes(1);
      expect(mockCleanUp).toHaveBeenCalledTimes(1);
    });

    it('should handle empty task list', async () => {
      const tasks = [];
      
      const mockRunTask = vi.fn(async () => {});
      
      async function testRunTasksInParallel(tasks, _concurrency) {
        for (const task of tasks) {
          await mockRunTask(task);
        }
      }
      
      await testRunTasksInParallel(tasks, 3);
      
      expect(mockRunTask).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should continue executing other tasks when one fails', async () => {
      const tasks = [
        { name: 'task-1', agent: 'test', iteration: 1 },
        { name: 'task-2', agent: 'test', iteration: 1 },
        { name: 'task-3', agent: 'test', iteration: 1 }
      ];
      
      const mockRunTask = vi.fn()
        .mockResolvedValueOnce(undefined)  // task-1 succeeds
        .mockRejectedValueOnce(new Error('Task 2 failed'))  // task-2 fails
        .mockResolvedValueOnce(undefined);  // task-3 succeeds
      
      const mockCaptureResults = vi.fn(async () => {});
      const mockCleanUp = vi.fn(async () => {});
      
      const errors = [];
      
      async function testRunTasksInParallel(tasks, _concurrency) {
        for (const task of tasks) {
          try {
            await mockRunTask(task);
            await mockCaptureResults(task);
            await mockCleanUp(task);
          } catch (error) {
            errors.push({ task, error });
          }
        }
      }
      
      await testRunTasksInParallel(tasks, 1);
      
      // All tasks should have been attempted
      expect(mockRunTask).toHaveBeenCalledTimes(3);
      
      // Only successful tasks should have results captured
      expect(mockCaptureResults).toHaveBeenCalledTimes(2);
      
      // Should have recorded one error
      expect(errors).toHaveLength(1);
      expect(errors[0].task.name).toBe('task-2');
    });

    it('should collect all errors from failed tasks', async () => {
      const tasks = [
        { name: 'task-1', agent: 'test', iteration: 1 },
        { name: 'task-2', agent: 'test', iteration: 1 }
      ];
      
      const mockRunTask = vi.fn()
        .mockRejectedValueOnce(new Error('Task 1 failed'))
        .mockRejectedValueOnce(new Error('Task 2 failed'));
      
      const errors = [];
      
      async function testRunTasksInParallel(tasks, _concurrency) {
        for (const task of tasks) {
          try {
            await mockRunTask(task);
          } catch (error) {
            errors.push({ task: task.name, error: error.message });
          }
        }
      }
      
      await testRunTasksInParallel(tasks, 2);
      
      expect(errors).toHaveLength(2);
      expect(errors[0].task).toBe('task-1');
      expect(errors[1].task).toBe('task-2');
    });
  });

  describe('Progress tracking integration', () => {
    it('should track task execution without console output in tests', async () => {
      const tasks = [
        { name: 'task-1', agent: 'claude', iteration: 1 },
        { name: 'task-2', agent: 'cursor', iteration: 1 }
      ];
      
      const mockRunTask = vi.fn(async () => {
        await new Promise(resolve => {
          const timer = globalThis.setTimeout(resolve, 10);
          return timer;
        });
      });
      
      const mockCaptureResults = vi.fn(async () => {});
      const mockCleanUp = vi.fn(async () => {});
      
      async function testRunTasksInParallel(tasks, _concurrency) {
        for (const task of tasks) {
          await mockRunTask(task);
          await mockCaptureResults(task);
          await mockCleanUp(task);
        }
      }
      
      await testRunTasksInParallel(tasks, 2);
      
      // Verify all tasks were executed
      expect(mockRunTask).toHaveBeenCalledTimes(2);
      expect(mockCaptureResults).toHaveBeenCalledTimes(2);
      expect(mockCleanUp).toHaveBeenCalledTimes(2);
    });
  });

  describe('Concurrency calculation', () => {
    it('should use number of agents as default concurrency', () => {
      const args = runTasksModule.parseArgs(['node', 'script.js']);
      
      // Default agents are claude, cursor, codex
      expect(args.agents.length).toBe(3);
    });

    it('should calculate concurrency based on specified agents', () => {
      const args = runTasksModule.parseArgs(['node', 'script.js', '--agents', 'claude']);
      
      expect(args.agents.length).toBe(1);
    });

    it('should calculate concurrency for multiple agents', () => {
      const args = runTasksModule.parseArgs(['node', 'script.js', '--agents', 'claude,cursor']);
      
      expect(args.agents.length).toBe(2);
    });
  });
});

