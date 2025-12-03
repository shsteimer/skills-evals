import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTaskInfoFolder } from '../scripts/run-tasks.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testResultsDir = path.join(__dirname, 'fixtures', 'results');

describe('createTaskInfoFolder', () => {
  let testTaskPath;
  
  beforeEach(async () => {
    // Create test task definition folder with required files
    testTaskPath = path.join(testResultsDir, 'test-task-def');
    await fs.mkdir(testTaskPath, { recursive: true });
    
    await fs.writeFile(
      path.join(testTaskPath, 'task.json'),
      JSON.stringify({ name: 'test-task', description: 'Test' }, null, 2)
    );
    await fs.writeFile(path.join(testTaskPath, 'prompt.txt'), 'Test prompt');
    await fs.writeFile(path.join(testTaskPath, 'criteria.txt'), 'Test criteria');
  });

  afterEach(async () => {
    // Clean up test results
    await fs.rm(testResultsDir, { recursive: true, force: true });
  });

  describe('folder structure', () => {
    it('should create folder at results/{timestamp}/taskname-agentname', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'test-agent',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-test-agent'),
        workspaceDir: '/tmp/workspace/20231215-143022/build-block-test-agent'
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      expect(folderPath).toContain('results');
      expect(folderPath).toContain(timestamp);
      expect(folderPath).toContain('build-block-test-agent');
      
      // Verify folder exists
      const stats = await fs.stat(folderPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should use timestamp from task object', async () => {
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6}).*/, '$1-$2');
      const task = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'test-agent',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-test-agent'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-test-agent`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      // Should match pattern: results/YYYYMMDD-HHMMSS/build-block-test-agent
      const pathParts = folderPath.split(path.sep);
      const timestampPart = pathParts[pathParts.length - 2];
      
      expect(timestampPart).toMatch(/^\d{8}-\d{6}$/);
      expect(folderPath).toContain('build-block-test-agent');
    });

    it('should create nested directory structure', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'deploy-service',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'deploy-service-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/deploy-service-claude`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const expectedPath = path.join(testResultsDir, timestamp, 'deploy-service-claude');
      expect(folderPath).toBe(expectedPath);
      
      // Verify entire path exists
      const stats = await fs.stat(folderPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('multiple tasks', () => {
    it('should create separate folders for different tasks with same timestamp', async () => {
      const timestamp = '20231215-143022';
      const task1 = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'test-agent',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-test-agent'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-test-agent`
      };
      const task2 = {
        name: 'deploy-service',
        taskPath: testTaskPath,
        agent: 'test-agent',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'deploy-service-test-agent'),
        workspaceDir: `/tmp/workspace/${timestamp}/deploy-service-test-agent`
      };
      
      const folder1 = await createTaskInfoFolder(task1);
      const folder2 = await createTaskInfoFolder(task2);
      
      expect(folder1).not.toBe(folder2);
      expect(folder1).toContain('build-block-test-agent');
      expect(folder2).toContain('deploy-service-test-agent');
      
      // Both should exist
      const stats1 = await fs.stat(folder1);
      const stats2 = await fs.stat(folder2);
      expect(stats1.isDirectory()).toBe(true);
      expect(stats2.isDirectory()).toBe(true);
    });

    it('should use same timestamp root folder for all tasks and agents', async () => {
      const timestamp = '20231215-143022';
      const task1 = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-claude`
      };
      const task2 = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'cursor',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-cursor'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-cursor`
      };
      const task3 = {
        name: 'deploy-service',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'deploy-service-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/deploy-service-claude`
      };
      
      const folder1 = await createTaskInfoFolder(task1);
      const folder2 = await createTaskInfoFolder(task2);
      const folder3 = await createTaskInfoFolder(task3);
      
      // All should share the same timestamp parent folder
      const parent1 = path.dirname(folder1);
      const parent2 = path.dirname(folder2);
      const parent3 = path.dirname(folder3);
      
      expect(parent1).toBe(parent2);
      expect(parent2).toBe(parent3);
      expect(path.basename(parent1)).toBe('20231215-143022');
    });
  });

  describe('return value', () => {
    it('should return the absolute path to created folder', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'test-agent',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-test-agent'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-test-agent`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      expect(path.isAbsolute(folderPath)).toBe(true);
      expect(folderPath).toContain('build-block-test-agent');
    });
  });

  describe('agent name handling', () => {
    it('should handle agent names with spaces', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'claude sonnet',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-claude-sonnet'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-claude-sonnet`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      // Should replace spaces with hyphens or similar
      expect(folderPath).toContain('build-block-claude-sonnet');
    });

    it('should handle agent names with special characters', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'build-block',
        taskPath: testTaskPath,
        agent: 'agent/v2.0',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'build-block-agentv20'),
        workspaceDir: `/tmp/workspace/${timestamp}/build-block-agentv20`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      // Should sanitize special characters from folder name
      const folderName = path.basename(folderPath);
      expect(folderName).not.toContain('/');
      expect(folderName).not.toContain('.');
      expect(folderName).toBe('build-block-agentv20');
    });
  });

  describe('copying task files', () => {
    it('should copy task.json to task info folder', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'test-task',
        description: 'Test',
        tags: [],
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'test-task-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/test-task-claude`,
        startFrom: 'https://github.com/org/repo',
        augmentations: []
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const taskJsonPath = path.join(folderPath, 'task.json');
      const exists = await fs.access(taskJsonPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      const content = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8'));
      expect(content.name).toBe('test-task');
      expect(content.description).toBe('Test');
    });

    it('should copy prompt.txt to task info folder', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'test-task',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'test-task-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/test-task-claude`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const promptPath = path.join(folderPath, 'prompt.txt');
      const content = await fs.readFile(promptPath, 'utf-8');
      expect(content).toBe('Test prompt');
    });

    it('should copy criteria.txt to task info folder', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'test-task',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'test-task-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/test-task-claude`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const criteriaPath = path.join(folderPath, 'criteria.txt');
      const content = await fs.readFile(criteriaPath, 'utf-8');
      expect(content).toBe('Test criteria');
    });

    it('should add agent name to copied task.json', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'test-task',
        taskPath: testTaskPath,
        agent: 'cursor',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'test-task-cursor'),
        workspaceDir: `/tmp/workspace/${timestamp}/test-task-cursor`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const taskJsonPath = path.join(folderPath, 'task.json');
      const content = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8'));
      expect(content.agent).toBe('cursor');
    });

    it('should add timestamp to copied task.json', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'test-task',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'test-task-claude'),
        workspaceDir: `/tmp/workspace/${timestamp}/test-task-claude`
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const taskJsonPath = path.join(folderPath, 'task.json');
      const content = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8'));
      expect(content.timestamp).toBe('20231215-143022');
    });

    it('should add workspace directory to copied task.json', async () => {
      const timestamp = '20231215-143022';
      const task = {
        name: 'test-task',
        taskPath: testTaskPath,
        agent: 'claude',
        timestamp,
        taskInfoFolder: path.join(testResultsDir, timestamp, 'test-task-claude'),
        workspaceDir: '/tmp/custom-workspace/20231215-143022/test-task-claude'
      };
      
      const folderPath = await createTaskInfoFolder(task);
      
      const taskJsonPath = path.join(folderPath, 'task.json');
      const content = JSON.parse(await fs.readFile(taskJsonPath, 'utf-8'));
      
      // Should be full path to this specific task/agent/timestamp workspace
      expect(content.workspaceDir).toBe('/tmp/custom-workspace/20231215-143022/test-task-claude');
    });

    it('should include combined augmentations from task object', async () => {
      const task = {
        name: 'test-task',
        description: 'Test task',
        tags: ['test'],
        agent: 'claude',
        timestamp: '20231215-143022',
        taskInfoFolder: path.join(testResultsDir, '20231215-143022', 'test-task-claude'),
        taskPath: testTaskPath,
        workspaceDir: '/tmp/workspace',
        startFrom: 'https://github.com/org/repo',
        augmentations: [
          { source: 'global.txt', target: 'global.txt' },
          { source: 'task-specific.txt', target: 'task-specific.txt' }
        ]
      };

      await createTaskInfoFolder(task);

      const taskJsonPath = path.join(task.taskInfoFolder, 'task.json');
      const taskJsonContent = await fs.readFile(taskJsonPath, 'utf-8');
      const taskJson = JSON.parse(taskJsonContent);

      // Should include all augmentations from the task object
      expect(taskJson.augmentations).toBeDefined();
      expect(taskJson.augmentations.length).toBe(2);
      expect(taskJson.augmentations[0].source).toBe('global.txt');
      expect(taskJson.augmentations[1].source).toBe('task-specific.txt');
    });

    it('should handle tasks without augmentations', async () => {
      const task = {
        name: 'test-task',
        description: 'Test task',
        tags: ['test'],
        agent: 'claude',
        timestamp: '20231215-143022',
        taskInfoFolder: path.join(testResultsDir, '20231215-143022', 'test-task-claude'),
        taskPath: testTaskPath,
        workspaceDir: '/tmp/workspace',
        startFrom: 'https://github.com/org/repo',
        augmentations: []
      };

      await createTaskInfoFolder(task);

      const taskJsonPath = path.join(task.taskInfoFolder, 'task.json');
      const taskJsonContent = await fs.readFile(taskJsonPath, 'utf-8');
      const taskJson = JSON.parse(taskJsonContent);

      // Should have empty augmentations array
      expect(taskJson.augmentations).toEqual([]);
    });
  });
});

