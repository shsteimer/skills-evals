import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { checkbox, input, select } from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALL_AGENTS = ['claude', 'cursor', 'codex'];

/**
 * Discover all available tasks from the tasks directory.
 * Returns task names and their tags for use in interactive selection.
 */
async function discoverTasks() {
  const tasksDir = path.join(__dirname, '..', '..', 'tasks');
  let entries;
  try {
    entries = await fs.readdir(tasksDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const tasks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskJsonPath = path.join(tasksDir, entry.name, 'task.json');
    try {
      const content = await fs.readFile(taskJsonPath, 'utf-8');
      const data = JSON.parse(content);
      tasks.push({
        name: data.name || entry.name,
        description: data.description || '',
        tags: data.tags || []
      });
    } catch {
      // Skip tasks without valid task.json
    }
  }
  return tasks;
}

/**
 * Discover all available augmentation files.
 */
async function discoverAugmentations() {
  const augDir = path.join(__dirname, '..', '..', 'augmentations');
  try {
    const entries = await fs.readdir(augDir);
    return entries
      .filter(f => f.endsWith('.json') || f.endsWith('.js') || f.endsWith('.mjs'))
      .map(f => path.join(augDir, f));
  } catch {
    return [];
  }
}

/**
 * Run the full interactive guided flow.
 * `defaults` can pre-populate values (e.g. from CLI flags).
 */
export async function runInteractiveFlow(defaults = {}) {
  const allTasks = await discoverTasks();
  if (allTasks.length === 0) {
    console.log('No tasks found in tasks/ directory.');
    process.exit(1);
  }

  // Collect all unique tags
  const allTags = [...new Set(allTasks.flatMap(t => t.tags))].sort();

  // Step 1: Filter mode
  const filterMode = await select({
    message: 'Filter tasks by:',
    choices: [
      { name: 'All tasks (excludes diagnostic)', value: 'all' },
      { name: 'Select specific tasks', value: 'tasks' },
      ...(allTags.length > 0 ? [{ name: 'Select by tags', value: 'tags' }] : [])
    ],
    default: resolveFilterDefault(defaults)
  });

  let selectedTasks = [];
  let selectedTags = [];

  if (filterMode === 'tasks') {
    selectedTasks = await checkbox({
      message: 'Select tasks:',
      choices: allTasks.map(t => ({
        name: `${t.name}${t.description ? ` — ${t.description}` : ''}`,
        value: t.name,
        checked: defaults.tasks?.includes(t.name) ?? false
      })),
      required: true
    });
  } else if (filterMode === 'tags') {
    selectedTags = await checkbox({
      message: 'Select tags (tasks matching ANY selected tag will run):',
      choices: allTags.map(tag => ({
        name: `${tag} (${allTasks.filter(t => t.tags.includes(tag)).length} tasks)`,
        value: tag,
        checked: defaults.tags?.includes(tag) ?? false
      })),
      required: true
    });
  }

  // Step 2: Agents
  const selectedAgents = await checkbox({
    message: 'Select agents:',
    choices: ALL_AGENTS.map(agent => ({
      name: agent,
      value: agent,
      checked: defaults.agents?.includes(agent) ?? true
    })),
    required: true
  });

  // Step 3: Iterations
  const timesStr = await input({
    message: 'Iterations per task:',
    default: String(defaults.times ?? 1),
    validate: (val) => {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 1) return 'Must be a positive integer';
      return true;
    }
  });
  const times = parseInt(timesStr, 10);

  // Step 4: Augmentation files (multi-select)
  const augFiles = await discoverAugmentations();
  let augmentationsFiles = [];
  if (augFiles.length > 0) {
    augmentationsFiles = await checkbox({
      message: 'Augmentation files:',
      choices: augFiles.map(f => ({
        name: path.basename(f),
        value: f,
        checked: defaults.augmentationsFiles?.includes(f) ?? false
      }))
    });
  }

  // Build args object
  const defaultWorkspace = path.join(os.tmpdir(), 'skills-evals-workspace');
  const args = {
    tasks: selectedTasks,
    tags: selectedTags,
    agents: selectedAgents,
    workspaceDir: defaults.workspaceDir ?? defaultWorkspace,
    augmentationsFiles,
    times,
    showHelp: false
  };

  // Show summary and confirm
  showSettingsSummary(args, allTasks);
  const action = await promptConfirmation();

  if (action === 'run') return args;
  if (action === 'edit') return runInteractiveFlow(args);
  process.exit(0);
}

/**
 * Show a summary of resolved settings and ask for confirmation.
 * Returns the args if confirmed, or enters guided flow if declined.
 */
export async function confirmOrEdit(args) {
  const allTasks = await discoverTasks();
  showSettingsSummary(args, allTasks);

  const action = await promptConfirmation();

  if (action === 'run') return args;
  if (action === 'edit') return runInteractiveFlow(args);
  process.exit(0);
}

async function promptConfirmation() {
  return select({
    message: 'Run with these settings?',
    choices: [
      { name: 'Run', value: 'run' },
      { name: 'Edit selections', value: 'edit' },
      { name: 'Quit', value: 'quit' }
    ]
  });
}

function resolveFilterDefault(defaults) {
  if (defaults.tasks?.length > 0) return 'tasks';
  if (defaults.tags?.length > 0) return 'tags';
  return 'all';
}

function showSettingsSummary(args, allTasks) {
  console.log('\n  Run Settings');
  console.log('  ' + '─'.repeat(40));

  // Resolve task names for display
  let taskNames;
  if (args.tasks.length > 0) {
    taskNames = args.tasks;
  } else if (args.tags.length > 0) {
    taskNames = allTasks
      .filter(t => args.tags.some(tag => t.tags.includes(tag)))
      .map(t => t.name);
    console.log(`  Tags:           ${args.tags.join(', ')}`);
  } else {
    taskNames = allTasks
      .filter(t => !t.tags.includes('diagnostic'))
      .map(t => t.name);
  }
  console.log(`  Tasks:          ${taskNames.join(', ') || '(none)'}`);

  console.log(`  Agents:         ${args.agents.join(', ')}`);
  console.log(`  Iterations:     ${args.times}`);
  const augDisplay = args.augmentationsFiles?.length > 0
    ? args.augmentationsFiles.map(f => path.basename(f)).join(', ')
    : 'None';
  console.log(`  Augmentations:  ${augDisplay}`);

  // Total runs
  const totalRuns = taskNames.length * args.agents.length * args.times;
  console.log(`  Total runs:     ${totalRuns}`);
  console.log('');
}

/**
 * Determine if CLI args have any user-provided flags (beyond defaults).
 */
export function hasUserFlags(argv) {
  // Check if any flags were actually passed (skip node and script path)
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('-') && arg !== '--') return true;
  }
  return false;
}
