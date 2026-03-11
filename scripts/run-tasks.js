import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { sanitizeName, getCurrentTimestamp, computeTaskHash } from './utils/string-utils.js';
import { copyDirectoryRecursive, ensureDir, cleanupDir } from './utils/fs-utils.js';
import { cloneRepository, checkoutBranch, addAndCommit, captureGitChanges, captureGitCommits } from './utils/git-utils.js';
import { downloadFromGitHub } from './utils/github-utils.js';
import { hasNpmScript, runNpmScript } from './utils/npm-utils.js';
import { runInParallel } from './utils/progress-utils.js';
import { extractAgentMetricsFromOutput } from './utils/agent-metrics.js';
import { getEnv, getAgentConfig } from './utils/env-config.js';
import { createRunLogger } from './utils/run-logger.js';
import { runTaskChecks } from './utils/task-checks.js';
import { hasUserFlags, confirmOrEdit, runInteractiveFlow } from './utils/interactive-prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function findTasks(args, tasksDir = null, augmentationsFiles = null) {
  // Validate that both task names and tags are not specified
  if (args.tasks && args.tasks.length > 0 && args.tags && args.tags.length > 0) {
    throw new Error('Cannot specify both task names and tags. Use one or the other.');
  }

  const baseDir = tasksDir || path.join(__dirname, '..', 'tasks');

  // Load global augmentations from one or more files (JSON or JS)
  const globalAugmentations = [];
  const globalScriptedAugmentations = [];
  let augmentationSetName = null;
  const augPaths = augmentationsFiles || args.augmentationsFiles || [];

  for (const augPath of augPaths) {
    if (augPath.endsWith('.js') || augPath.endsWith('.mjs')) {
      // Scripted augmentation: JS module with { name, augment } default export
      const mod = await import(path.resolve(augPath));
      const script = mod.default;
      if (!script || typeof script.augment !== 'function') {
        throw new Error(`Scripted augmentation must export default { name, augment } (${augPath})`);
      }
      globalScriptedAugmentations.push({ ...script, path: augPath });
      if (script.name) {
        augmentationSetName = augmentationSetName
          ? `${augmentationSetName} + ${script.name}`
          : script.name;
      }
    } else {
      // JSON augmentation: file copy entries
      try {
        const globalAugContent = await fs.readFile(augPath, 'utf-8');
        const parsed = JSON.parse(globalAugContent);

        // Support both formats:
        //   New: { name: "...", augmentations: [...] }
        //   Legacy: [...]
        if (Array.isArray(parsed)) {
          globalAugmentations.push(...parsed);
        } else if (parsed && Array.isArray(parsed.augmentations)) {
          globalAugmentations.push(...parsed.augmentations);
          if (parsed.name) {
            augmentationSetName = augmentationSetName
              ? `${augmentationSetName} + ${parsed.name}`
              : parsed.name;
          }
        } else {
          throw new Error(`Augmentations file must contain an array or {name, augmentations} object (${augPath})`);
        }
      } catch (error) {
        if (error.message.includes('Augmentations file must contain')) throw error;
        throw new Error(`Error reading augmentations file ${augPath}: ${error.message}`);
      }
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
        scriptedAugmentations: globalScriptedAugmentations,
        augmentationSetName,
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
  } else if (!args.tasks || args.tasks.length === 0) {
    // When no tags or task names specified, exclude diagnostic tasks
    filteredTasks = filteredTasks.filter(task => {
      if (!task.tags || !Array.isArray(task.tags)) return true;
      return !task.tags.includes('diagnostic');
    });
  }
  
  return filteredTasks;
}

const configDir = path.join(__dirname, '..', 'config');

/**
 * Copy agent-specific config files into the workspace.
 * Each agent has its own config layout:
 * - claude: config/claude-settings.json → .claude/settings.json
 * - cursor: config/cursor-cli.json → .cursor/cli.json, config/cursor-system-prompt.md → .cursor/rules/system-prompt.md
 * - codex: config/codex-config.toml → .codex/config.toml
 */
export async function copyAgentConfig(agent, workspaceDir) {
  const copies = {
    claude: [
      { src: 'claude-settings.json', dest: '.claude/settings.json' },
    ],
    cursor: [
      { src: 'cursor-cli.json', dest: '.cursor/cli.json' },
      { src: 'cursor-system-prompt.md', dest: '.cursor/rules/system-prompt.md' },
    ],
    codex: [
      { src: 'codex-config.toml', dest: '.codex/config.toml' },
    ],
  };

  const filesToCopy = copies[agent] || [];
  for (const { src, dest } of filesToCopy) {
    const srcPath = path.join(configDir, src);
    try {
      await fs.access(srcPath);
      const destPath = path.join(workspaceDir, dest);
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(srcPath, destPath);
    } catch {
      // Config file doesn't exist — skip
    }
  }
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
  
  // Copy agent-specific config into workspace (baseline, before augmentations)
  await copyAgentConfig(sanitizeName(task.agent), task.workspaceDir);

  // Apply file-copy augmentations
  // Sources can be:
  //   1. Local file or folder (relative or absolute path)
  //   2. GitHub URL (file or folder) - uses git clone with your credentials
  //      - https://github.com/org/repo/blob/branch/path/to/file.txt (single file)
  //      - https://github.com/org/repo/blob/commit-hash/path/to/file.txt (file at specific commit)
  //      - https://github.com/org/repo/tree/branch/path/to/folder (folder)
  //      - https://raw.githubusercontent.com/org/repo/branch/path/to/file.txt (single file)
  //   3. HTTP/HTTPS URL to a file (any publicly accessible URL)
  if (task.augmentations && Array.isArray(task.augmentations)) {
    for (const aug of task.augmentations) {
      // Skip augmentations that target specific agents if current agent doesn't match
      if (Array.isArray(aug.agents) && aug.agents.length > 0 && !aug.agents.includes(task.agent)) {
        continue;
      }
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
            // Relative path - could be relative to taskPath (task-specific) or CWD (global)
            const taskRelativePath = path.join(task.taskPath, aug.source);
            const cwdRelativePath = path.resolve(process.cwd(), aug.source);

            try {
              await fs.access(taskRelativePath);
              sourcePath = taskRelativePath;
            } catch {
              // If not found in task path, assume it's relative to CWD
              sourcePath = cwdRelativePath;
            }
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

  }

  // Run scripted augmentations
  if (task.scriptedAugmentations && Array.isArray(task.scriptedAugmentations)) {
    const context = {
      workspaceDir: task.workspaceDir,
      agent: task.agent,
      taskName: task.name
    };
    for (const script of task.scriptedAugmentations) {
      await script.augment(context);
    }
  }

  // Single commit for all workspace setup (augmentations + agent settings)
  addAndCommit(task.workspaceDir, 'Workspace setup');

  // Create and checkout new branch for the agent (after setup commits)
  const agentBranch = `${sanitizeName(task.agent)}-${task.timestamp}-${task.iteration}`;
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
  
  // Compute a content hash from the source task definition files
  // so results can be grouped by task version
  const sourcePromptPath = path.join(task.taskPath, 'prompt.txt');
  const sourceCriteriaPath = path.join(task.taskPath, 'criteria.txt');
  const sourceTaskJsonPath = path.join(task.taskPath, 'task.json');
  const [sourcePrompt, sourceCriteria, sourceTaskJsonContent] = await Promise.all([
    fs.readFile(sourcePromptPath, 'utf-8'),
    fs.readFile(sourceCriteriaPath, 'utf-8'),
    fs.readFile(sourceTaskJsonPath, 'utf-8')
  ]);
  const taskHash = computeTaskHash(sourcePrompt, sourceCriteria, sourceTaskJsonContent);

  // Build task.json with all runtime information
  const taskJson = {
    name: task.name,
    description: task.description,
    tags: task.tags,
    startFrom: task.startFrom,
    augmentations: task.augmentations,
    scriptedAugmentations: (task.scriptedAugmentations || []).map(s => ({ name: s.name, path: s.path })),
    augmentationSetName: task.augmentationSetName || null,
    agent: task.agent,
    model: task.model || null,
    runSetId: task.timestamp,
    iteration: task.iteration,
    timestamp: task.timestamp,
    workspaceDir: task.workspaceDir,
    taskHash
  };

  // Write task.json to task info folder
  const destTaskJsonPath = path.join(task.taskInfoFolder, 'task.json');
  await fs.writeFile(destTaskJsonPath, JSON.stringify(taskJson, null, 2), 'utf-8');

  // Copy prompt.txt and criteria.txt
  const destPromptPath = path.join(task.taskInfoFolder, 'prompt.txt');
  await fs.copyFile(sourcePromptPath, destPromptPath);

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
    augmentationsFiles: [], // Only load if explicitly specified
    times: 1, // Number of times to run each task
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
      result.augmentationsFiles.push(argv[++i]);
    } else if (arg === '--times' && i + 1 < argv.length) {
      const value = parseInt(argv[++i], 10);
      if (isNaN(value) || value < 1) {
        throw new Error('--times must be a positive integer');
      }
      result.times = value;
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
  --augmentations <f> Augmentation file(s) to apply (can be used multiple times)
  --workspace <path>  Directory to create task workspaces (default: system temp)
  --times <number>    Number of times to run each task (default: 1)
  -h, --help          Show this help message

Examples:
  npm run run-tasks --task build-block
  npm run run-tasks --task build-block,deploy-service
  npm run run-tasks --tag cdd --tag blocks
  npm run run-tasks --agents claude --task build-block
  npm run run-tasks --augmentations augmentations/skills-only.json
  npm run run-tasks --augmentations augmentations/a.json --augmentations augmentations/b.json
  npm run run-tasks --workspace /tmp/my-workspace --task build-block
  npm run run-tasks --task build-block --times 3
`);
}

export function enrichTasks(tasks, agents, workspaceDir, times = 1) {
  // Generate timestamp once for the entire run
  const timestamp = getCurrentTimestamp();
  const resultsBaseDir = path.join(__dirname, '..', 'results');
  
  // Create enriched task objects for each task/agent/iteration combination
  // Order by iteration first, then agent - this ensures parallel execution spreads across agents
  const enrichedTasks = [];
  for (const task of tasks) {
    for (let iteration = 1; iteration <= times; iteration++) {
      for (const agent of agents) {
        const sanitizedAgent = sanitizeName(agent);
        const folderName = `${task.name}-${sanitizedAgent}-${iteration}`;
        
        const config = getAgentConfig(agent);
        const enrichedTask = {
          ...task,
          agent,
          model: config.model || null,
          timestamp,
          iteration,
          taskInfoFolder: path.join(resultsBaseDir, timestamp, folderName),
          workspaceDir: path.join(workspaceDir, timestamp, folderName)
        };
        
        enrichedTasks.push(enrichedTask);
      }
    }
  }
  
  return enrichedTasks;
}

async function runTask(task, onActivity, signal) {
  // Dynamically load the handler for the specified agent
  const handlerPath = `./handlers/${sanitizeName(task.agent)}.js`;

  try {
    const handler = await import(handlerPath);
    const runHandler = handler.default;

    if (typeof runHandler !== 'function') {
      throw new Error(`Handler at ${handlerPath} does not export a default function`);
    }

    await runHandler(task, onActivity, signal);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`No handler found for agent '${task.agent}'. Expected handler at ${handlerPath}`);
    }
    throw error;
  }
}

async function captureResults(task, runMetrics = null) {
  const results = {};

  // Capture diff of all changes from augmentations commit
  results.diff = await captureGitChanges(task.workspaceDir, 'Workspace setup');
  
  // Capture git commit history (agent's commits)
  results.commits = await captureGitCommits(task.workspaceDir, 'Workspace setup');
  
  // Run tests if test script exists
  if (await hasNpmScript(task.workspaceDir, 'test')) {
    results.tests = await runNpmScript(task.workspaceDir, 'test');
  }

  // Run task-specific checks if checks.js exists
  if (task.taskPath) {
    results.checks = await runTaskChecks(task.taskPath, task.workspaceDir);
  }

  // Write test results if they exist
  if (results.tests) {
    const testsPath = path.join(task.taskInfoFolder, 'test-results.json');
    await fs.writeFile(testsPath, JSON.stringify(results.tests, null, 2), 'utf-8');
  }

  // Write check results if any
  if (results.checks) {
    const checksPath = path.join(task.taskInfoFolder, 'check-results.json');
    await fs.writeFile(checksPath, JSON.stringify(results.checks, null, 2), 'utf-8');
  }

  // Write git commits if any
  if (results.commits && results.commits.length > 0) {
    const commitsPath = path.join(task.taskInfoFolder, 'commits.json');
    await fs.writeFile(commitsPath, JSON.stringify(results.commits, null, 2), 'utf-8');
  }
  
  // Write diff as separate file
  const diffPath = path.join(task.taskInfoFolder, 'changes.diff');
  await fs.writeFile(diffPath, results.diff || '', 'utf-8');

  // Capture agent output usage metrics if available
  const outputPath = path.join(task.taskInfoFolder, 'output.jsonl');
  let outputMetrics = null;
  try {
    const output = await fs.readFile(outputPath, 'utf-8');
    outputMetrics = extractAgentMetricsFromOutput(output);
  } catch {
    // output.jsonl may be missing for failed/incomplete runs
  }

  if (runMetrics || outputMetrics) {
    const runMetricsPath = path.join(task.taskInfoFolder, 'run-metrics.json');
    await fs.writeFile(
      runMetricsPath,
      JSON.stringify(
        {
          ...(runMetrics || {}),
          ...(outputMetrics || {})
        },
        null,
        2
      ),
      'utf-8'
    );
  }
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

function getTaskId(task) {
  return `${task.name}-${sanitizeName(task.agent)}-${task.iteration}`;
}

async function processTask(task, onActivity) {
  // Bootstrap workspace just-in-time so setup pipelines with other tasks running
  if (onActivity) onActivity('bootstrapping workspace...');
  await createTaskWorkspace(task);

  const timeoutMs = parseInt(getEnv('AGENT_TIMEOUT_MS', ''), 10) || DEFAULT_AGENT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const startedAt = new Date().toISOString();
  const start = Date.now();
  let runError = null;
  let timedOut = false;
  try {
    await runTask(task, onActivity, ac.signal);
  } catch (error) {
    timedOut = ac.signal.aborted;
    runError = timedOut
      ? new Error(`Agent timed out after ${timeoutMs / 1000}s`)
      : error;
  } finally {
    clearTimeout(timer);
  }
  if (onActivity) onActivity(timedOut ? 'timed out, capturing partial results...' : 'capturing results...');
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - start;
  await captureResults(task, { startedAt, finishedAt, durationMs, timedOut });
  await cleanUp(task);
  if (runError) throw runError;
}

export function buildBatchMetadata(args, enrichedTasks, startedAt, finishedAt, hasFailures, timedOutRuns = []) {
  const timestamp = enrichedTasks[0]?.timestamp || null;
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  // Collect unique task names
  const taskNames = [...new Set(enrichedTasks.map(t => t.name))];

  // Build agent → model map
  const agentModels = {};
  for (const task of enrichedTasks) {
    if (!agentModels[task.agent]) {
      agentModels[task.agent] = task.model || null;
    }
  }

  // Count completed vs failed based on whether taskInfoFolder has a run-metrics.json
  // Since we don't have per-task status here, use the overall hasFailures flag
  const runCount = enrichedTasks.length;
  const failedCount = hasFailures ? null : 0; // null = unknown breakdown
  const completedCount = hasFailures ? null : runCount;

  return {
    timestamp,
    startedAt,
    finishedAt,
    durationMs,
    args: {
      tasks: args.tasks,
      tags: args.tags,
      agents: args.agents,
      times: args.times,
      workspaceDir: args.workspaceDir,
      augmentationsFiles: args.augmentationsFiles
    },
    augmentationSetName: enrichedTasks[0]?.augmentationSetName || null,
    agentModels,
    taskNames,
    runCount,
    completedCount,
    failedCount,
    timedOutRuns
  };
}

async function collectTimedOutRuns(enrichedTasks) {
  const timedOut = [];
  for (const task of enrichedTasks) {
    if (!task.taskInfoFolder) continue;
    try {
      const metricsPath = path.join(task.taskInfoFolder, 'run-metrics.json');
      const metrics = JSON.parse(await fs.readFile(metricsPath, 'utf-8'));
      if (metrics.timedOut) {
        timedOut.push(path.basename(task.taskInfoFolder));
      }
    } catch {
      // run-metrics.json may not exist for runs that failed before capturing results
    }
  }
  return timedOut;
}

async function runTasks() {
  const parsedArgs = parseArgs(process.argv);

  if (parsedArgs.showHelp) {
    showHelp();
    return;
  }

  // Interactive mode: guided flow or confirm-before-run
  let args;
  if (hasUserFlags(process.argv)) {
    args = await confirmOrEdit(parsedArgs);
  } else {
    args = await runInteractiveFlow();
  }

  const tasks = await findTasks(args);
  const enrichedTasks = enrichTasks(tasks, args.agents, args.workspaceDir, args.times);

  // Create result folders up front so the full run is visible immediately
  for (const task of enrichedTasks) {
    await createTaskInfoFolder(task);
  }

  // Set up run logger
  const timestamp = enrichedTasks[0]?.timestamp;
  const resultsBaseDir = path.join(__dirname, '..', 'results');
  let logger = null;
  if (timestamp) {
    const logPath = path.join(resultsBaseDir, timestamp, 'batch.log');
    logger = createRunLogger(logPath);
    await logger.init();
  }

  // Run the tasks in parallel
  const startedAt = new Date().toISOString();
  const concurrency = args.agents.length;
  const hasFailures = await runInParallel(enrichedTasks, concurrency, processTask, getTaskId, { logger });
  const finishedAt = new Date().toISOString();

  // Write batch.json
  if (timestamp) {
    const timedOutRuns = await collectTimedOutRuns(enrichedTasks);
    const batchMetadata = buildBatchMetadata(args, enrichedTasks, startedAt, finishedAt, hasFailures, timedOutRuns);
    const batchJsonPath = path.join(resultsBaseDir, timestamp, 'batch.json');
    await fs.writeFile(batchJsonPath, JSON.stringify(batchMetadata, null, 2), 'utf-8');
  }

  // Exit with non-zero code if any tasks failed
  if (hasFailures) {
    process.exit(1);
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTasks();
}
