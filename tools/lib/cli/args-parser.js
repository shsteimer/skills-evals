/**
 * Parse command line arguments for run-tasks
 */
export function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    test: null,
    tags: [],
    skills: [],
    agents: ['claude-code', 'cursor-cli', 'codex-cli'],
    setupOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--task':
      case '--test':
        options.test = next;
        i++;
        break;
      case '--tags':
        options.tags = next ? next.split(',').map((t) => t.trim()) : [];
        i++;
        break;
      case '--skills':
        options.skills = next ? next.split(',').map((s) => s.trim()) : [];
        i++;
        break;
      case '--agents':
        options.agents = next ? next.split(',').map((a) => a.trim()) : ['claude-code', 'cursor-cli', 'codex-cli'];
        i++;
        break;
      case '--setup-only':
      case '--dry-run':
        options.setupOnly = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Print usage information
 */
export function printUsage() {
  console.log(`
Test Runner for Agent Skills Evaluation Framework

Usage:
  ./tools/run-tasks.js --task <task-name>
  ./tools/run-tasks.js --tags <tag1,tag2>
  ./tools/run-tasks.js --skills <skill1,skill2>

Options:
  --task <name>         Run specific task(s) by name (path to task directory)
  --test <name>         Alias for --task
  --tags <tags>         Run tasks matching these tags (comma-separated)
  --skills <skills>     Run tasks using these skills (comma-separated)
  --agents <agents>     Agent(s) to test with (default: all agents)
                        Options: claude-code, cursor-cli, codex-cli
  --setup-only          Set up test environment but don't run agent (shows commands)
  --dry-run             Alias for --setup-only

Examples:
  ./tools/run-tasks.js --task tasks/unit/building-blocks/create-simple-block
  ./tools/run-tasks.js --tags blocks,basic
  ./tools/run-tasks.js --skills building-blocks
  ./tools/run-tasks.js --tags blocks --agents claude-code,cursor-cli

At least one of --task, --tags, or --skills is required.
`);
}

/**
 * Validate parsed arguments
 */
export async function validateArgs(options, checkAgentAvailability) {
  const errors = [];

  // Must have at least one selector
  if (!options.test && options.tags.length === 0 && options.skills.length === 0) {
    errors.push('Must specify at least one of: --task, --tags, or --skills');
  }

  // Validate agent names
  const validAgents = ['claude-code', 'cursor-cli', 'codex-cli'];
  for (const agent of options.agents) {
    if (!validAgents.includes(agent)) {
      errors.push(`Invalid agent: ${agent}. Valid options: ${validAgents.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    console.error('Validation errors:');
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error('\nRun --help for usage information.');
    process.exit(1);
  }

  // Check agent availability
  console.log('Checking agent availability...');
  for (const agent of options.agents) {
    const check = await checkAgentAvailability(agent);
    if (!check.available) {
      console.error(`\n✗ Agent not available: ${agent}`);
      if (check.binary) {
        console.error(`  Binary '${check.binary}' not found in PATH`);
      }
      if (check.installInstructions) {
        console.error(`  Installation: ${check.installInstructions}`);
      }
      if (check.error) {
        console.error(`  Error: ${check.error}`);
      }
      process.exit(1);
    } else {
      console.log(`  ✓ ${agent} available`);
    }
  }
  console.log('');
}
