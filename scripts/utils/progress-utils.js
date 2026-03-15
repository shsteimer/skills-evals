/**
 * Creates a progress tracker for monitoring task execution
 * @param {number} totalTasks - Total number of tasks to track
 * @param {Function} getTaskId - Function to generate task ID from task object
 * @param {Object} [options]
 * @param {Object} [options.logger] - Optional run logger for writing to a log file
 * @param {number} [options.concurrency] - Concurrency level (for logger output)
 * @returns {Object} Progress tracker with methods for updating and displaying progress
 */
export function createProgressTracker(totalTasks, getTaskId, options = {}) {
  const { logger, concurrency } = options;
  const state = {
    running: new Map(), // taskId -> task name
    startTimes: new Map(), // taskId -> Date.now()
    activity: new Map(), // taskId -> latest activity message
    completed: 0,
    failed: 0,
    total: totalTasks,
    runStartTime: Date.now(),
    errors: [] // Array of { taskId, error }
  };

  function formatElapsed(ms) {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m${String(remainSecs).padStart(2, '0')}s`;
  }

  function updateDisplay() {
    const runningCount = state.running.size;
    const now = Date.now();
    const lines = [];
    lines.push(`Running: ${runningCount} | Completed: ${state.completed} | Failed: ${state.failed} | Total: ${state.total}`);
    for (const [taskId] of state.running) {
      const elapsed = formatElapsed(now - (state.startTimes.get(taskId) || now));
      const activity = state.activity.get(taskId) || 'starting...';
      lines.push(`  ${taskId} [${elapsed}]: ${activity}`);
    }
    // Clear previous output and write new status
    process.stdout.write(`\x1b[${lines.length + 1}A\x1b[J${lines.join('\n')}\n`);
  }

  // Print initial blank lines so the first updateDisplay has room to move cursor up
  let initialized = false;
  function ensureInitialized() {
    if (!initialized) {
      const runningCount = state.running.size;
      const lineCount = 1 + runningCount;
      process.stdout.write('\n'.repeat(lineCount));
      initialized = true;
    }
  }

  return {
    async start() {
      if (logger) {
        await logger.runStarted(totalTasks, concurrency || 1);
      }
    },

    async taskStarted(task) {
      const taskId = getTaskId(task);
      state.running.set(taskId, taskId);
      state.startTimes.set(taskId, Date.now());
      ensureInitialized();
      updateDisplay();
      // Start refresh interval if not already running
      if (!state.refreshInterval) {
        state.refreshInterval = setInterval(updateDisplay, 5000);
      }
      if (logger) {
        await logger.taskStarted(taskId);
      }
    },

    async taskActivity(taskId, message) {
      const sanitized = message.replace(/\n/g, ' ').slice(0, 120);
      state.activity.set(taskId, sanitized);
      updateDisplay();
      if (logger) {
        await logger.taskActivity(taskId, sanitized);
      }
    },

    async taskCompleted(task) {
      const taskId = getTaskId(task);
      const durationMs = Date.now() - (state.startTimes.get(taskId) || Date.now());
      state.running.delete(taskId);
      state.startTimes.delete(taskId);
      state.activity.delete(taskId);
      state.completed++;
      updateDisplay();
      if (logger) {
        await logger.taskCompleted(taskId, durationMs);
      }
    },

    async taskFailed(task, error) {
      const taskId = getTaskId(task);
      const durationMs = Date.now() - (state.startTimes.get(taskId) || Date.now());
      state.running.delete(taskId);
      state.startTimes.delete(taskId);
      state.activity.delete(taskId);
      state.failed++;
      state.errors.push({ taskId, error: error.message });
      updateDisplay();
      if (logger) {
        await logger.taskFailed(taskId, durationMs, error.message);
      }
    },

    async printSummary() {
      if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
        state.refreshInterval = null;
      }
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
      if (logger) {
        const totalDurationMs = Date.now() - state.runStartTime;
        await logger.runFinished(state.completed, state.failed, totalDurationMs);
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
 * @param {Object} [options]
 * @param {Object} [options.logger] - Optional run logger for writing to a log file
 * @returns {Promise<boolean>} True if any tasks failed
 */
export async function runInParallel(tasks, concurrency, processTask, getTaskId, options = {}) {
  const tracker = createProgressTracker(tasks.length, getTaskId, {
    logger: options.logger,
    concurrency,
  });
  await tracker.start();
  
  // Create a queue of tasks to process
  const queue = [...tasks];
  const running = new Set();
  
  async function executeTask(task) {
    await tracker.taskStarted(task);
    const taskId = getTaskId(task);
    const onActivity = (message) => tracker.taskActivity(taskId, message);

    try {
      await processTask(task, onActivity);
      await tracker.taskCompleted(task);
    } catch (error) {
      await tracker.taskFailed(task, error);
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
  
  await tracker.printSummary();

  return tracker.hasFailed();
}


