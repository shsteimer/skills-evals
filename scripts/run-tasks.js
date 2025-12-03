import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

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

function sanitizeName(name) {
  // Replace spaces with hyphens and remove special characters
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function getCurrentTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

async function copyDirectoryRecursive(src, dest) {
  // Create destination directory
  await fs.mkdir(dest, { recursive: true });
  
  // Read all entries in source directory
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      // Copy file
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function downloadFromGitHub(source, destPath, mode = 'merge') {
  // Parse GitHub URL to extract org, repo, branch/commit, and path
  // Supports:
  //   - https://github.com/org/repo/blob/branch/path/to/file.txt (file)
  //   - https://github.com/org/repo/blob/commit-hash/path/to/file.txt (file at specific commit)
  //   - https://github.com/org/repo/tree/branch/path/to/folder (folder)
  //   - https://raw.githubusercontent.com/org/repo/branch/path/to/file.txt (raw file)
  
  // Strategy: Clone repo to temp folder, copy what we need, delete temp folder
  // This uses user's existing git credentials and has no rate limits
  
  let org, repo, branch, itemPath;
  
  const url = new URL(source);
  const pathParts = url.pathname.split('/').filter(p => p);
  
  if (url.hostname === 'raw.githubusercontent.com') {
    // Raw file URL: raw.githubusercontent.com/org/repo/branch/path/to/file
    org = pathParts[0];
    repo = pathParts[1];
    branch = pathParts[2];
    itemPath = pathParts.slice(3).join('/');
  } else if (url.hostname.includes('github.com')) {
    // Regular GitHub URL
    org = pathParts[0];
    repo = pathParts[1];
    
    if (pathParts[2] === 'tree') {
      // Folder: github.com/org/repo/tree/branch/path/to/folder
      branch = pathParts[3];
      itemPath = pathParts.slice(4).join('/');
    } else if (pathParts[2] === 'blob') {
      // File: github.com/org/repo/blob/branch/path/to/file
      branch = pathParts[3];
      itemPath = pathParts.slice(4).join('/');
    } else {
      throw new Error(`Unsupported GitHub URL format: ${source}`);
    }
  } else {
    throw new Error(`Invalid GitHub URL: ${source}`);
  }
  
  // Clone repo to temp directory
  const { execSync } = await import('child_process');
  const tempDir = path.join(os.tmpdir(), `gh-aug-${Date.now()}`);
  const cloneUrl = `https://github.com/${org}/${repo}.git`;
  
  try {
    try {
      // Check if branch looks like a commit hash (40 character hex string)
      const isCommitHash = /^[0-9a-f]{40}$/i.test(branch);
      
      if (isCommitHash) {
        // For commit hashes, clone without depth and checkout the specific commit
        execSync(`git clone ${cloneUrl} "${tempDir}"`, {
          stdio: 'pipe'
        });
        execSync(`git checkout ${branch}`, {
          cwd: tempDir,
          stdio: 'pipe'
        });
      } else {
        // For branches, use --depth 1 for faster cloning
        execSync(`git clone --depth 1 --branch ${branch} ${cloneUrl} "${tempDir}"`, {
          stdio: 'pipe'
        });
      }
    } catch (error) {
      const refType = /^[0-9a-f]{40}$/i.test(branch) ? 'commit' : 'branch';
      throw new Error(
        `Failed to clone repository for augmentation from ${source}.\n` +
        `Make sure the repository exists, you have access, and the ${refType} '${branch}' exists.\n` +
        `Error: ${error.message}`
      );
    }
    
    // Source path within the cloned repo
    const sourcePath = path.join(tempDir, itemPath);
    
    // Check if source exists
    let stats;
    try {
      stats = await fs.stat(sourcePath);
    } catch (error) {
      throw new Error(
        `Path '${itemPath}' not found in repository ${org}/${repo} on branch '${branch}'.\n` +
        `Make sure the path exists in the repository.`
      );
    }
    
    if (stats.isDirectory()) {
      // Handle replace mode for directories
      if (mode === 'replace') {
        await fs.rm(destPath, { recursive: true, force: true });
      }
      
      // Copy directory recursively
      await copyDirectoryRecursive(sourcePath, destPath);
    } else {
      // Handle single file
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(sourcePath, destPath);
    }
  } finally {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function createTaskWorkspace(task) {
  // Create workspace directory
  await fs.mkdir(task.workspaceDir, { recursive: true });
  
  // Setup git repository - startFrom is required
  if (!task.startFrom) {
    throw new Error('startFrom is required');
  }
  
  const { execSync } = await import('child_process');
  
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
      execSync(`git clone --branch ${branch} ${cloneUrl} "${tempDir}"`, {
        stdio: 'pipe' // Suppress git output unless there's an error
      });
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
              await fs.rm(targetPath, { recursive: true, force: true });
            }
            
            // Copy directory recursively
            await copyDirectoryRecursive(sourcePath, targetPath);
          } else {
            // Handle single file
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.copyFile(sourcePath, targetPath);
          }
        }
      }
    }
    
    // Commit augmentations
    try {
      // Add all augmented files
      execSync('git add .', { cwd: task.workspaceDir });
      
      // Commit with message
      execSync('git commit -m "Add task augmentations"', { cwd: task.workspaceDir });
    } catch (error) {
      // If nothing to commit, that's okay
    }
  }
  
  // Create and checkout new branch for the agent (after augmentations are committed)
  const agentBranch = `${sanitizeName(task.agent)}-${task.timestamp}`;
  execSync(`git checkout -b ${agentBranch}`, { cwd: task.workspaceDir });
}

export async function createTaskInfoFolder(task) {
  // Create the directory structure
  await fs.mkdir(task.taskInfoFolder, { recursive: true });
  
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
    await copyResults(task);
    await cleanUp(task);
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTasks();
}
