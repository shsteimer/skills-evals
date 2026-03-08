import fs from 'fs/promises';
import path from 'path';

/**
 * Creates a run logger that appends timestamped lines to a log file.
 * Designed for `tail -f` monitoring. Activity messages are throttled
 * per task to avoid overwhelming the log.
 *
 * @param {string} logPath - Absolute path to the log file
 * @param {Object} [options]
 * @param {number} [options.activityThrottleMs=10000] - Min ms between activity logs per task
 * @param {Function} [options.now] - Optional clock function for testing (returns Date)
 * @returns {Object} Logger with event methods
 */
export function createRunLogger(logPath, options = {}) {
  const { activityThrottleMs = 10000, now = () => new Date() } = options;
  const lastActivity = new Map(); // taskId -> timestamp of last logged activity

  function formatTime(date) {
    return date.toTimeString().slice(0, 8);
  }

  function formatDuration(ms) {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    if (mins < 60) return `${mins}m${String(remainSecs).padStart(2, '0')}s`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h${String(remainMins).padStart(2, '0')}m`;
  }

  async function writeLine(line) {
    const timestamp = formatTime(now());
    await fs.appendFile(logPath, `[${timestamp}] ${line}\n`, 'utf-8');
  }

  return {
    async init() {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
    },

    async runStarted(totalTasks, concurrency) {
      await writeLine(`run started — ${totalTasks} tasks, concurrency ${concurrency}`);
    },

    async taskStarted(taskId) {
      lastActivity.delete(taskId);
      await writeLine(`${taskId} | started`);
    },

    async taskActivity(taskId, message) {
      const current = now().getTime();
      const last = lastActivity.get(taskId) || 0;
      if (current - last < activityThrottleMs) return;
      lastActivity.set(taskId, current);
      await writeLine(`${taskId} | ${message}`);
    },

    async taskCompleted(taskId, durationMs) {
      lastActivity.delete(taskId);
      await writeLine(`${taskId} | completed (${formatDuration(durationMs)})`);
    },

    async taskFailed(taskId, durationMs, error) {
      lastActivity.delete(taskId);
      await writeLine(`${taskId} | failed (${formatDuration(durationMs)}): ${error}`);
    },

    async runFinished(completed, failed, totalDurationMs) {
      const total = completed + failed;
      const parts = [`${completed} completed`];
      if (failed > 0) parts.push(`${failed} failed`);
      await writeLine(`run finished — ${parts.join(', ')} of ${total} (${formatDuration(totalDurationMs)})`);
    },

    formatTime,
    formatDuration,
  };
}
