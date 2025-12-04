import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { sanitizeName, getCurrentTimestamp } from './utils/string-utils.js';
import { copyDirectoryRecursive, ensureDir, cleanupDir } from './utils/fs-utils.js';
import { cloneRepository, checkoutBranch, addAndCommit, captureGitChanges, captureGitCommits } from './utils/git-utils.js';
import { downloadFromGitHub } from './utils/github-utils.js';
import { hasNpmScript, runNpmScript } from './utils/npm-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function findTasks(args, tasksDir = null, augmentationsFile = null) {
  // Validate that both task names and tags are not specified
  if (args.tasks && args.tasks.length > 0 && args.tags && args.tags.length > 0) {
    throw new Error('Cannot specify both task names and tags. Use one or the other.');
  }

  const baseDir = tasksDir || path.join(__dirname, '..', 'tasks');
  
  // Load global augmentations if a file path is specified
  let globalAugmentations = [];
  const globalAugmentationsPath = augmentationsFile || args.augmentationsFile;
  
  if (globalAugmentationsPath) {
    try {
      const globalAugContent = await fs.readFile(globalAugmentationsPath, 'utf-8');
      globalAugmentations = JSON.parse(globalAugContent);
      if (!Array.isArray(globalAugmentations)) {
        throw new Error(`Augmentations file must contain an array (${globalAugmentationsPath})`);
      }
    } catch (error) {
      throw new Error(`Error reading augmentations file ${globalAugmentationsPath}: ${error.message}`);
    }
  }
  
  // Read all directories in the tasks folder
  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (error) {
    // If tasks directory doesn't exist, return empty array
    return [];
  }
  
  const taskDirs = entries.filter(entry => entry.isDirectory());
  
  // Load each task
  const allTasks = [];
  for (const dir of taskDirs) {
    const taskPath = path.join(baseDir, dir.name);
    const taskJsonPath = path.join(taskPath, 'task.json');
    const promptPath = path.join(taskPath, 'prompt.txt');
    const criteriaPath = path.join(taskPath, 'criteria.txt');
    
    try {
      // Read task.json
      const taskJsonContent = await fs.readFile(taskJsonPath, 'utf-8');
      const taskData = JSON.parse(taskJsonContent);
      
      // Read prompt.txt
      const prompt = await fs.readFile(promptPath, 'utf-8');
      
      // Read criteria.txt
      const criteria = await fs.readFile(criteriaPath, 'utf-8');
      
      // Combine global augmentations with task-specific ones
      // Global augmentations come first, task-specific can override
      const augmentations = [
        ...globalAugmentations,
        ...(taskData.augmentations || [])
      ];
      
      // Combine all data
      allTasks.push({
        ...taskData,
        augmentations,
        taskPath,
        prompt,
        criteria
      });
    } catch (error) {
      // Skip tasks that don't have required files
      continue;
    }
  }
  
  // Apply filters
  let filteredTasks = allTasks;
  
  // Filter by task names if specified
  if (args.tasks && args.tasks.length > 0) {
    filteredTasks = filteredTasks.filter(task => 
      args.tasks.includes(task.name)
    );
  }
  
  // Filter by tags if specified (OR logic: task must have ANY of the specified tags)
  if (args.tags && args.tags.length > 0) {
    filteredTasks = filteredTasks.filter(task => {
      if (!task.tags || !Array.isArray(task.tags)) {
        return false;
      }
      return args.tags.some(tag => task.tags.includes(tag));
    });
  }
  
  return filteredTasks;
}

export async function createTaskWorkspace(task) {
  // Create workspace directory
  await ensureDir(task.workspaceDir);
  
  // Setup git repository - startFrom is required
  if (!task.startFrom) {
    throw new Error('startFrom is required');
  }
  
  {
    // Parse GitHub URL
    // Supports: https://github.com/org/repo or https://github.com/org/repo/tree/branch
    let url;
    try {
      url = new URL(task.startFrom);
    } catch (error) {
      throw new Error('startFrom must be a valid GitHub URL');
    }
    
    if (!url.hostname.includes('github.com')) {
      throw new Error('startFrom must be a valid GitHub URL');
    }
    
    const pathParts = url.pathname.split('/').filter(p => p);
    const org = pathParts[0];
    const repo = pathParts[1];
    
    if (!org || !repo) {
      throw new Error('startFrom must be a valid GitHub URL');
    }
    
    let branch = 'main';
    if (pathParts[2] === 'tree' && pathParts[3]) {
      branch = pathParts[3];
    }
    
    const cloneUrl = `https://github.com/${org}/${repo}.git`;
    
    // Clone the repo into a temp location first
    const tempDir = path.join(os.tmpdir(), `clone-${Date.now()}`);
    
    try {
      cloneRepository(cloneUrl, tempDir, { branch });
    } catch (error) {
      throw new Error(
        `Failed to clone repository from ${task.startFrom}.\n` +
        `Make sure the repository exists, you have access, and the branch '${branch}' exists.\n` +
        `Error: ${error.message}`
      );
    }
    
    // Move contents to workspace dir
    const entries = await fs.readdir(tempDir);
    for (const entry of entries) {
      await fs.rename(
        path.join(tempDir, entry),
        path.join(task.workspaceDir, entry)
      );
    }
    
    // Clean up temp dir
    await fs.rmdir(tempDir);
  }
  
  // Apply augmentations if specified
  // Augmentation sources can be:
  //   1. Local file or folder (relative or absolute path)
  //   2. GitHub URL (file or folder) - uses git clone with your credentials
  //      - https://github.com/org/repo/blob/branch/path/to/file.txt (single file)
  //      - https://github.com/org/repo/blob/commit-hash/path/to/file.txt (file at specific commit)
  //      - https://github.com/org/repo/tree/branch/path/to/folder (folder)
  //      - https://raw.githubusercontent.com/org/repo/branch/path/to/file.txt (single file)
  //   3. HTTP/HTTPS URL to a file (any publicly accessible URL)
  if (task.augmentations && Array.isArray(task.augmentations)) {
    for (const aug of task.augmentations) {
      if (aug.source && aug.target) {
        const targetPath = path.join(task.workspaceDir, aug.target);
        const mode = aug.mode || 'merge'; // Default to merge mode
        
        // Determine source type and handle accordingly
        if (aug.source.startsWith('http://') || aug.source.startsWith('https://')) {
          // HTTP/HTTPS URL - could be GitHub or any other URL
          if (aug.source.includes('github.com')) {
            // GitHub URL - handle files and folders via API
            await downloadFromGitHub(aug.source, targetPath, mode);
          } else {
            // Regular HTTP/HTTPS URL - treat as single file
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            
            const response = await fetch(aug.source);
            if (!response.ok) {
              throw new Error(`Failed to fetch ${aug.source}: ${response.statusText}`);
            }
            const content = await response.text();
            await fs.writeFile(targetPath, content, 'utf-8');
          }
        } else {
          // Local file or folder path (relative or absolute)
          let sourcePath;
          if (path.isAbsolute(aug.source)) {
            sourcePath = aug.source;
          } else {
            // Relative path - resolve from taskPath
            sourcePath = path.join(task.taskPath, aug.source);
          }
          
          // Check if source exists and is file or directory
          const stats = await fs.stat(sourcePath);
          
          if (stats.isDirectory()) {
            // Handle replace mode for directories
            if (mode === 'replace') {
              await cleanupDir(targetPath);
            }
            
            // Copy directory recursively
            await copyDirectoryRecursive(sourcePath, targetPath);
          } else {
            // Handle single file
            await ensureDir(path.dirname(targetPath));
            await fs.copyFile(sourcePath, targetPath);
          }
        }
      }
    }
    
    // Commit augmentations
    addAndCommit(task.workspaceDir, 'Add task augmentations');
  }
  
  // Create and checkout new branch for the agent (after augmentations are committed)
  const agentBranch = `${sanitizeName(task.agent)}-${task.timestamp}`;
  checkoutBranch(task.workspaceDir, agentBranch, true);
  
  // Install dependencies if package.json exists
  const packageJsonPath = path.join(task.workspaceDir, 'package.json');
  try {
    await fs.access(packageJsonPath);
    // package.json exists, run npm ci
    const { execAsync } = await import('./utils/process-utils.js');
    await execAsync('npm ci', { cwd: task.workspaceDir });
  } catch (error) {
    // package.json doesn't exist or npm ci failed - continue anyway
    // The agent might not need dependencies, or might install them themselves
  }
}

export async function createTaskInfoFolder(task) {
  // Create the directory structure
  await ensureDir(task.taskInfoFolder);
  
  // Build task.json with all runtime information
  // Use task data directly (includes global + task-specific augmentations)
  const taskJson = {
    name: task.name,
    description: task.description,
    tags: task.tags,
    startFrom: task.startFrom,
    augmentations: task.augmentations, // This includes global + task-specific
    agent: task.agent,
    timestamp: task.timestamp,
    workspaceDir: task.workspaceDir
  };
  
  // Write task.json to task info folder
  const destTaskJsonPath = path.join(task.taskInfoFolder, 'task.json');
  await fs.writeFile(destTaskJsonPath, JSON.stringify(taskJson, null, 2), 'utf-8');
  
  // Copy prompt.txt
  const sourcePromptPath = path.join(task.taskPath, 'prompt.txt');
  const destPromptPath = path.join(task.taskInfoFolder, 'prompt.txt');
  await fs.copyFile(sourcePromptPath, destPromptPath);
  
  // Copy criteria.txt
  const sourceCriteriaPath = path.join(task.taskPath, 'criteria.txt');
  const destCriteriaPath = path.join(task.taskInfoFolder, 'criteria.txt');
  await fs.copyFile(sourceCriteriaPath, destCriteriaPath);
  
  return task.taskInfoFolder;
}

export function parseArgs(argv) {
  const result = {
    tasks: [],
    tags: [],
    agents: [],
    workspaceDir: path.join(os.tmpdir(), 'skills-evals-workspace'),
    augmentationsFile: null, // Only load if explicitly specified
    showHelp: false
  };

  // Skip first two args (node and script path)
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
    } else if (arg === '--task' && i + 1 < argv.length) {
      const value = argv[++i];
      // Handle comma-separated values
      const tasks = value.split(',').map(t => t.trim()).filter(t => t);
      result.tasks.push(...tasks);
    } else if (arg === '--tag' && i + 1 < argv.length) {
      const value = argv[++i];
      // Handle comma-separated values
      const tags = value.split(',').map(t => t.trim()).filter(t => t);
      result.tags.push(...tags);
    } else if (arg === '--agents' && i + 1 < argv.length) {
      const value = argv[++i];
      // Handle comma-separated values
      const agents = value.split(',').map(a => a.trim()).filter(a => a);
      result.agents.push(...agents);
    } else if (arg === '--workspace' && i + 1 < argv.length) {
      result.workspaceDir = argv[++i];
    } else if (arg === '--augmentations' && i + 1 < argv.length) {
      result.augmentationsFile = argv[++i];
    }
  }

  // Set default agents if none specified
  if (result.agents.length === 0) {
    result.agents = ['claude', 'cursor', 'codex'];
  }

  return result;
}

function showHelp() {
  console.log(`
Usage: npm run run-tasks [options]

Options:
  --task <name>       Task name(s) to run (can be used multiple times or comma-separated)
  --tag <tag>         Filter tasks by tag(s) - matches ANY tag (can be used multiple times or comma-separated)
  --agents <name>     Agent(s) to run tasks with (default: claude,cursor,codex)
  --workspace <path>  Directory to create task workspaces (default: system temp)
  -h, --help          Show this help message

Examples:
  npm run run-tasks --task build-block
  npm run run-tasks --task build-block,deploy-service
  npm run run-tasks --tag cdd --tag blocks
  npm run run-tasks --agents claude --task build-block
  npm run run-tasks --workspace /tmp/my-workspace --task build-block
`);
}

export function enrichTasks(tasks, agents, workspaceDir) {
  // Generate timestamp once for the entire run
  const timestamp = getCurrentTimestamp();
  const resultsBaseDir = path.join(__dirname, '..', 'results');
  
  // Create enriched task objects for each task/agent combination
  const enrichedTasks = [];
  for (const task of tasks) {
    for (const agent of agents) {
      const sanitizedAgent = sanitizeName(agent);
      const folderName = `${task.name}-${sanitizedAgent}`;
      
      const enrichedTask = {
        ...task,
        agent,
        timestamp,
        taskInfoFolder: path.join(resultsBaseDir, timestamp, folderName),
        workspaceDir: path.join(workspaceDir, timestamp, folderName)
      };
      
      enrichedTasks.push(enrichedTask);
    }
  }
  
  return enrichedTasks;
}

async function runTask(task) {
  // Dynamically load the handler for the specified agent
  const handlerPath = `./handlers/${sanitizeName(task.agent)}.js`;
  
  try {
    const handler = await import(handlerPath);
    const runHandler = handler.default;
    
    if (typeof runHandler !== 'function') {
      throw new Error(`Handler at ${handlerPath} does not export a default function`);
    }
    
    await runHandler(task);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`No handler found for agent '${task.agent}'. Expected handler at ${handlerPath}`);
    }
    throw error;
  }
}

async function captureResults(task) {
  const results = {};
  
  // Run npm run lint and capture status (if lint script exists)
  if (await hasNpmScript(task.workspaceDir, 'lint')) {
    results.lint = await runNpmScript(task.workspaceDir, 'lint');
  } else {
    results.lint = {
      skipped: true,
      reason: 'No lint script found in package.json'
    };
  }
  
  // Capture diff of all changes from augmentations commit
  results.diff = await captureGitChanges(task.workspaceDir, 'Add task augmentations');
  
  // Capture git commit history (agent's commits)
  results.commits = await captureGitCommits(task.workspaceDir, 'Add task augmentations');
  
  // Run tests if test script exists
  if (await hasNpmScript(task.workspaceDir, 'test')) {
    results.tests = await runNpmScript(task.workspaceDir, 'test');
  }
  
  // Write lint results to separate file
  const lintPath = path.join(task.taskInfoFolder, 'lint-results.json');
  await fs.writeFile(lintPath, JSON.stringify(results.lint, null, 2), 'utf-8');
  
  // Write test results if they exist
  if (results.tests) {
    const testsPath = path.join(task.taskInfoFolder, 'test-results.json');
    await fs.writeFile(testsPath, JSON.stringify(results.tests, null, 2), 'utf-8');
  }
  
  // Write git commits if any
  if (results.commits && results.commits.length > 0) {
    const commitsPath = path.join(task.taskInfoFolder, 'commits.json');
    await fs.writeFile(commitsPath, JSON.stringify(results.commits, null, 2), 'utf-8');
  }
  
  // Write diff as separate file
  const diffPath = path.join(task.taskInfoFolder, 'changes.diff');
  await fs.writeFile(diffPath, results.diff || '', 'utf-8');
}

async function cleanUp(task) {
  // Remove the workspace directory
  try {
    await cleanupDir(task.workspaceDir);
  } catch (error) {
    // Log error but don't fail - workspace cleanup is best-effort
    console.error(`Warning: Failed to cleanup workspace ${task.workspaceDir}: ${error.message}`);
  }
}

async function runTasks() {
  const args = parseArgs(process.argv);
  
  if (args.showHelp) {
    showHelp();
    return;
  }
  
  const tasks = await findTasks(args);
  const enrichedTasks = enrichTasks(tasks, args.agents, args.workspaceDir);
  
  // Prepare task folders for each enriched task
  for (const task of enrichedTasks) {
    await createTaskInfoFolder(task);
    await createTaskWorkspace(task);
  }

  // Run the tasks for each enriched task
  for (const task of enrichedTasks) {
    await runTask(task);
    await captureResults(task);
    await cleanUp(task);
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTasks();
}
