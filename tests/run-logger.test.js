import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createRunLogger } from '../scripts/utils/run-logger.js';

describe('createRunLogger', () => {
  let logDir;
  let logPath;

  beforeEach(async () => {
    logDir = path.join(os.tmpdir(), `run-logger-test-${Date.now()}`);
    logPath = path.join(logDir, 'batch.log');
  });

  afterEach(async () => {
    try {
      await fs.rm(logDir, { recursive: true });
    } catch {
      // cleanup best-effort
    }
  });

  function fixedClock(dateStr) {
    return () => new Date(dateStr);
  }

  async function readLog() {
    return (await fs.readFile(logPath, 'utf-8')).trimEnd().split('\n');
  }

  it('should create log directory on init', async () => {
    const logger = createRunLogger(logPath);
    await logger.init();
    const stat = await fs.stat(logDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should log run started', async () => {
    const logger = createRunLogger(logPath, { now: fixedClock('2026-03-08T13:15:02') });
    await logger.init();
    await logger.runStarted(15, 3);
    const lines = await readLog();
    expect(lines).toEqual(['[13:15:02] run started — 15 tasks, concurrency 3']);
  });

  it('should log task lifecycle events', async () => {
    const logger = createRunLogger(logPath, {
      now: fixedClock('2026-03-08T10:00:00'),
      activityThrottleMs: 0,
    });
    await logger.init();
    await logger.taskStarted('build-block-claude-1');
    await logger.taskActivity('build-block-claude-1', 'reading AGENTS.md');
    await logger.taskCompleted('build-block-claude-1', 343000);
    const lines = await readLog();
    expect(lines).toEqual([
      '[10:00:00] build-block-claude-1 | started',
      '[10:00:00] build-block-claude-1 | reading AGENTS.md',
      '[10:00:00] build-block-claude-1 | completed (5m43s)',
    ]);
  });

  it('should log task failure with error message', async () => {
    const logger = createRunLogger(logPath, { now: fixedClock('2026-03-08T10:00:00') });
    await logger.init();
    await logger.taskFailed('build-block-claude-1', 120000, 'Agent timed out after 300s');
    const lines = await readLog();
    expect(lines).toEqual([
      '[10:00:00] build-block-claude-1 | failed (2m00s): Agent timed out after 300s',
    ]);
  });

  it('should log run finished summary', async () => {
    const logger = createRunLogger(logPath, { now: fixedClock('2026-03-08T14:30:00') });
    await logger.init();
    await logger.runFinished(12, 3, 4500000);
    const lines = await readLog();
    expect(lines).toEqual([
      '[14:30:00] run finished — 12 completed, 3 failed of 15 (1h15m)',
    ]);
  });

  it('should omit failed count when zero', async () => {
    const logger = createRunLogger(logPath, { now: fixedClock('2026-03-08T14:30:00') });
    await logger.init();
    await logger.runFinished(10, 0, 3600000);
    const lines = await readLog();
    expect(lines[0]).toContain('10 completed of 10');
    expect(lines[0]).not.toContain('failed');
  });

  describe('activity throttling', () => {
    it('should throttle activity messages per task', async () => {
      let currentTime = new Date('2026-03-08T10:00:00').getTime();
      const logger = createRunLogger(logPath, {
        activityThrottleMs: 10000,
        now: () => new Date(currentTime),
      });
      await logger.init();

      await logger.taskStarted('task-1');
      await logger.taskActivity('task-1', 'first message');
      currentTime += 5000; // 5s later — should be throttled
      await logger.taskActivity('task-1', 'throttled message');
      currentTime += 6000; // 11s total — should pass
      await logger.taskActivity('task-1', 'second message');

      const lines = await readLog();
      const activityLines = lines.filter(l => l.includes('task-1 |') && !l.includes('started'));
      expect(activityLines).toHaveLength(2);
      expect(activityLines[0]).toContain('first message');
      expect(activityLines[1]).toContain('second message');
    });

    it('should track throttling independently per task', async () => {
      let currentTime = new Date('2026-03-08T10:00:00').getTime();
      const logger = createRunLogger(logPath, {
        activityThrottleMs: 10000,
        now: () => new Date(currentTime),
      });
      await logger.init();

      await logger.taskStarted('task-1');
      await logger.taskStarted('task-2');
      await logger.taskActivity('task-1', 'task-1 first');
      await logger.taskActivity('task-2', 'task-2 first');
      currentTime += 5000;
      await logger.taskActivity('task-1', 'task-1 throttled');
      await logger.taskActivity('task-2', 'task-2 throttled');

      const lines = await readLog();
      const activityLines = lines.filter(l => !l.includes('started'));
      expect(activityLines).toHaveLength(2);
    });

    it('should reset throttle when task completes and restarts', async () => {
      const currentTime = new Date('2026-03-08T10:00:00').getTime();
      const logger = createRunLogger(logPath, {
        activityThrottleMs: 10000,
        now: () => new Date(currentTime),
      });
      await logger.init();

      await logger.taskStarted('task-1');
      await logger.taskActivity('task-1', 'first');
      await logger.taskCompleted('task-1', 5000);
      // New task with same ID — throttle should be reset
      await logger.taskStarted('task-1');
      await logger.taskActivity('task-1', 'after restart');

      const lines = await readLog();
      const activityLines = lines.filter(l => l.includes('task-1 |') && !l.includes('started') && !l.includes('completed'));
      expect(activityLines).toHaveLength(2);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds', () => {
      const logger = createRunLogger(logPath);
      expect(logger.formatDuration(5000)).toBe('5s');
      expect(logger.formatDuration(59000)).toBe('59s');
    });

    it('should format minutes and seconds', () => {
      const logger = createRunLogger(logPath);
      expect(logger.formatDuration(60000)).toBe('1m00s');
      expect(logger.formatDuration(343000)).toBe('5m43s');
      expect(logger.formatDuration(3599000)).toBe('59m59s');
    });

    it('should format hours and minutes', () => {
      const logger = createRunLogger(logPath);
      expect(logger.formatDuration(3600000)).toBe('1h00m');
      expect(logger.formatDuration(4500000)).toBe('1h15m');
    });
  });
});
