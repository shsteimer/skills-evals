/**
 * Creates a progress tracker for monitoring task execution
 * @param {number} totalTasks - Total number of tasks to track
 * @param {Function} getTaskId - Function to generate task ID from task object
 * @returns {Object} Progress tracker with methods for updating and displaying progress
 */
export function createProgressTracker(totalTasks, getTaskId) {
  const state = {
    running: new Map(), // taskId -> task name
    completed: 0,
    failed: 0,
    total: totalTasks,
    errors: [] // Array of { taskId, error }
  };

  function updateDisplay() {
    const runningCount = state.running.size;
    const runningTasks = Array.from(state.running.values()).join(', ');
    const runningInfo = runningCount > 0 ? ` [${runningTasks}]` : '';
    
    const status = `Running: ${runningCount} | Completed: ${state.completed} | Failed: ${state.failed} | Total: ${state.total}${runningInfo}`;
    process.stdout.write(`\r${status}`);
  }

  return {
    taskStarted(task) {
      const taskId = getTaskId(task);
      state.running.set(taskId, taskId);
      updateDisplay();
    },
    
    taskCompleted(task) {
      const taskId = getTaskId(task);
      state.running.delete(taskId);
      state.completed++;
      updateDisplay();
    },
    
    taskFailed(task, error) {
      const taskId = getTaskId(task);
      state.running.delete(taskId);
      state.failed++;
      state.errors.push({ taskId, error: error.message });
      updateDisplay();
    },
    
    printSummary() {
      // Print newline to move past the progress line
      console.log('\n');
      
      if (state.errors.length === 0) {
        console.log(`✓ All ${state.completed} tasks completed successfully`);
      } else {
        console.log(`✓ ${state.completed} tasks completed successfully`);
        console.log(`✗ ${state.failed} tasks failed:\n`);
        for (const { taskId, error } of state.errors) {
          console.log(`  - ${taskId}: ${error}`);
        }
      }
    },
    
    hasFailed() {
      return state.failed > 0;
    }
  };
}

/**
 * Runs tasks in parallel with concurrency control
 * @param {Array} tasks - Array of tasks to process
 * @param {number} concurrency - Maximum number of tasks to run concurrently
 * @param {Function} processTask - Async function to process each task
 * @param {Function} getTaskId - Function to generate task ID from task object
 * @returns {Promise<boolean>} True if any tasks failed
 */
export async function runInParallel(tasks, concurrency, processTask, getTaskId) {
  const tracker = createProgressTracker(tasks.length, getTaskId);
  
  // Create a queue of tasks to process
  const queue = [...tasks];
  const running = new Set();
  
  async function executeTask(task) {
    tracker.taskStarted(task);
    
    try {
      await processTask(task);
      tracker.taskCompleted(task);
    } catch (error) {
      tracker.taskFailed(task, error);
    }
  }
  
  async function startNext() {
    if (queue.length === 0) {
      return null;
    }
    
    const task = queue.shift();
    const promise = executeTask(task).then(() => {
      running.delete(promise);
      // Start the next task when this one completes
      return startNext();
    });
    
    running.add(promise);
    return promise;
  }
  
  // Start initial batch of tasks up to concurrency limit
  const initialPromises = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    initialPromises.push(startNext());
  }
  
  // Wait for all tasks to complete
  await Promise.all(initialPromises);
  
  // Wait for any remaining running tasks
  if (running.size > 0) {
    await Promise.all(Array.from(running));
  }
  
  tracker.printSummary();
  
  return tracker.hasFailed();
}


