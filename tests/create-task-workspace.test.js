import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTaskWorkspace } from '../scripts/run-tasks.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testWorkspaceRoot = path.join(__dirname, 'fixtures', 'workspaces');

// Helper to mock git clone
const mockGitClone = () => {
  execSync.mockImplementation((cmd) => {
    // Synchronously create directories when git clone is called
    if (cmd.includes('git clone')) {
      const match = cmd.match(/git clone[^"]*"([^"]+)"/);
      if (match) {
        const targetDir = match[1];
        // Use synchronous fs operations since execSync is synchronous
        const fsSync = require('fs');
        fsSync.mkdirSync(path.join(targetDir, '.git'), { recursive: true });
        fsSync.writeFileSync(path.join(targetDir, 'README.md'), '# Test Repo');
      }
    }
    return Buffer.from('');
  });
};

describe('createTaskWorkspace', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Default mock behavior for execSync
    mockGitClone();
  });

  afterEach(async () => {
    // Clean up test workspaces
    await fs.rm(testWorkspaceRoot, { recursive: true, force: true });
  });

  describe('workspace creation', () => {
    it('should create workspace directory', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://github.com/adobe/aem-boilerplate'
      };

      await createTaskWorkspace(task);

      const stats = await fs.stat(task.workspaceDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directory structure', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://github.com/adobe/aem-boilerplate'
      };

      await createTaskWorkspace(task);

      // Verify parent directories were created
      const parentStats = await fs.stat(path.join(testWorkspaceRoot, '20231215-143022'));
      expect(parentStats.isDirectory()).toBe(true);
    });
  });

  describe('git repository setup', () => {
    it('should clone git repo from GitHub URL', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://github.com/adobe/aem-boilerplate'
      };

      await createTaskWorkspace(task);

      // Verify git clone was called with correct repo
      const cloneCalls = execSync.mock.calls.filter(call => call[0].includes('git clone'));
      expect(cloneCalls.length).toBeGreaterThan(0);
      expect(cloneCalls[0][0]).toContain('https://github.com/adobe/aem-boilerplate.git');
    });

    it('should create a new branch for the agent', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://github.com/adobe/aem-boilerplate'
      };

      await createTaskWorkspace(task);

      // Verify git checkout was called with agent branch
      expect(execSync).toHaveBeenCalledWith(
        'git checkout -b claude-20231215-143022',
        expect.objectContaining({ cwd: task.workspaceDir })
      );
    });

    it('should throw error when startFrom is not defined', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude')
      };

      await expect(createTaskWorkspace(task)).rejects.toThrow('startFrom is required');
    });

    it('should throw error when startFrom is empty string', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: ''
      };

      await expect(createTaskWorkspace(task)).rejects.toThrow('startFrom is required');
    });

    it('should throw error when startFrom is not a valid URL', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'not-a-url'
      };

      await expect(createTaskWorkspace(task)).rejects.toThrow('startFrom must be a valid GitHub URL');
    });

    it('should throw error when startFrom is not a GitHub URL', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://gitlab.com/org/repo'
      };

      await expect(createTaskWorkspace(task)).rejects.toThrow('startFrom must be a valid GitHub URL');
    });

    it('should handle commit hash in GitHub URL', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        taskPath: testWorkspaceRoot,
        augmentations: [
          {
            source: 'https://github.com/adobe/aem-boilerplate/blob/abc123def456789012345678901234567890abcd/README.md',
            target: 'README.md'
          }
        ]
      };

      // Mock git clone to detect commit hash handling
      const cloneCommands = [];
      execSync.mockImplementation((cmd) => {
        cloneCommands.push(cmd);
        if (cmd.includes('git clone')) {
          const match = cmd.match(/git clone[^"]*"([^"]+)"/);
          if (match) {
            const targetDir = match[1];
            const fsSync = require('fs');
            fsSync.mkdirSync(path.join(targetDir, '.git'), { recursive: true });
            fsSync.writeFileSync(path.join(targetDir, 'README.md'), '# Test');
          }
        }
        return Buffer.from('');
      });

      await createTaskWorkspace(task);

      // Should have cloned without --depth for commit hash
      const augClone = cloneCommands.find(cmd => cmd.includes('gh-aug'));
      expect(augClone).toBeDefined();
      expect(augClone).not.toContain('--depth');
      
      // Should have done a checkout for the commit
      const checkoutCmd = cloneCommands.find(cmd => cmd.includes('git checkout') && cmd.includes('abc123'));
      expect(checkoutCmd).toBeDefined();
    });
  });

  describe('augmentations', () => {
    it('should copy augmentation files to workspace', async () => {
      // Create source file for augmentation
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'AGENTS.md'), 'Instructions for agents');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'AGENTS.md', target: 'AGENTS.md' }
        ]
      };

      await createTaskWorkspace(task);

      const targetFile = path.join(task.workspaceDir, 'AGENTS.md');
      const content = await fs.readFile(targetFile, 'utf-8');
      expect(content).toBe('Instructions for agents');
    });

    it('should commit augmentations to git', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'AGENTS.md'), 'Instructions');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'AGENTS.md', target: 'AGENTS.md' }
        ]
      };

      await createTaskWorkspace(task);

      // Verify git commit was called
      expect(execSync).toHaveBeenCalledWith(
        'git commit -m "Add task augmentations"',
        expect.objectContaining({ cwd: task.workspaceDir })
      );
    });

    it('should handle multiple augmentations', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'Content 2');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'file1.txt', target: 'file1.txt' },
          { source: 'file2.txt', target: 'docs/file2.txt' }
        ]
      };

      await createTaskWorkspace(task);

      const file1 = await fs.readFile(path.join(task.workspaceDir, 'file1.txt'), 'utf-8');
      const file2 = await fs.readFile(path.join(task.workspaceDir, 'docs', 'file2.txt'), 'utf-8');
      
      expect(file1).toBe('Content 1');
      expect(file2).toBe('Content 2');
    });

    it('should work without augmentations', async () => {
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        startFrom: 'https://github.com/adobe/aem-boilerplate'
      };

      await createTaskWorkspace(task);

      const stats = await fs.stat(task.workspaceDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories for augmentation targets', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'Content');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'file.txt', target: 'deep/nested/path/file.txt' }
        ]
      };

      await createTaskWorkspace(task);

      const targetFile = path.join(task.workspaceDir, 'deep', 'nested', 'path', 'file.txt');
      const content = await fs.readFile(targetFile, 'utf-8');
      expect(content).toBe('Content');
    });

    it('should commit all augmented files in a single commit', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(sourceDir, 'file2.txt'), 'Content 2');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'file1.txt', target: 'file1.txt' },
          { source: 'file2.txt', target: 'file2.txt' }
        ]
      };

      await createTaskWorkspace(task);

      // Verify git commit was called for the augmentations
      const commitCalls = execSync.mock.calls.filter(call => 
        call[0].includes('git commit') && call[0].includes('Add task augmentations')
      );
      expect(commitCalls.length).toBe(1);
    });

    it('should handle absolute path for augmentation source', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      const absoluteSourcePath = path.join(sourceDir, 'absolute-file.txt');
      await fs.writeFile(absoluteSourcePath, 'Absolute path content');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: absoluteSourcePath, target: 'file.txt' }
        ]
      };

      await createTaskWorkspace(task);

      const targetFile = path.join(task.workspaceDir, 'file.txt');
      const content = await fs.readFile(targetFile, 'utf-8');
      expect(content).toBe('Absolute path content');
    });

    it('should detect URL source by protocol', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      
      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { 
            source: 'https://httpstat.us/404',
            target: 'downloaded.txt'
          }
        ]
      };

      // This will fail to fetch with 404
      try {
        await createTaskWorkspace(task);
        throw new Error('Should have failed');
      } catch (error) {
        // Expected to fail fetching (either "Failed to fetch" or "fetch failed")
        expect(error.message.toLowerCase()).toContain('fetch');
      }
    });
  });

  describe('folder augmentations', () => {
    it('should copy folders recursively', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(path.join(sourceDir, 'my-folder', 'subfolder'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'my-folder', 'file1.txt'), 'File 1');
      await fs.writeFile(path.join(sourceDir, 'my-folder', 'subfolder', 'file2.txt'), 'File 2');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'my-folder', target: 'copied-folder' }
        ]
      };

      await createTaskWorkspace(task);

      const file1 = await fs.readFile(path.join(task.workspaceDir, 'copied-folder', 'file1.txt'), 'utf-8');
      const file2 = await fs.readFile(path.join(task.workspaceDir, 'copied-folder', 'subfolder', 'file2.txt'), 'utf-8');
      
      expect(file1).toBe('File 1');
      expect(file2).toBe('File 2');
    });

    it('should merge folder by default (overwrite existing files)', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(path.join(sourceDir, 'folder'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'folder', 'new.txt'), 'New content');
      await fs.writeFile(path.join(sourceDir, 'folder', 'existing.txt'), 'Updated content');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'folder', target: 'target' }
        ]
      };

      // Pre-create target folder with existing file
      await fs.mkdir(path.join(task.workspaceDir, 'target'), { recursive: true });
      await fs.writeFile(path.join(task.workspaceDir, 'target', 'existing.txt'), 'Old content');
      await fs.writeFile(path.join(task.workspaceDir, 'target', 'other.txt'), 'Should remain');

      await createTaskWorkspace(task);

      const newFile = await fs.readFile(path.join(task.workspaceDir, 'target', 'new.txt'), 'utf-8');
      const existingFile = await fs.readFile(path.join(task.workspaceDir, 'target', 'existing.txt'), 'utf-8');
      const otherFile = await fs.readFile(path.join(task.workspaceDir, 'target', 'other.txt'), 'utf-8');
      
      expect(newFile).toBe('New content');
      expect(existingFile).toBe('Updated content'); // Should be overwritten
      expect(otherFile).toBe('Should remain'); // Should still exist
    });

    it('should replace folder when mode is "replace"', async () => {
      const sourceDir = path.join(testWorkspaceRoot, 'source');
      await fs.mkdir(path.join(sourceDir, 'folder'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'folder', 'new.txt'), 'New content');

      const task = {
        name: 'test-task',
        agent: 'claude',
        timestamp: '20231215-143022',
        workspaceDir: path.join(testWorkspaceRoot, '20231215-143022', 'test-task-claude'),
        taskPath: sourceDir,
        startFrom: 'https://github.com/adobe/aem-boilerplate',
        augmentations: [
          { source: 'folder', target: 'target', mode: 'replace' }
        ]
      };

      // Pre-create target folder with existing file
      await fs.mkdir(path.join(task.workspaceDir, 'target'), { recursive: true });
      await fs.writeFile(path.join(task.workspaceDir, 'target', 'old.txt'), 'Should be deleted');

      await createTaskWorkspace(task);

      const newFile = await fs.readFile(path.join(task.workspaceDir, 'target', 'new.txt'), 'utf-8');
      expect(newFile).toBe('New content');
      
      // Old file should be gone
      const oldExists = await fs.access(path.join(task.workspaceDir, 'target', 'old.txt'))
        .then(() => true).catch(() => false);
      expect(oldExists).toBe(false);
    });
  });
});

