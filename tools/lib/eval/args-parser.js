import { existsSync } from 'fs';

/**
 * Parse command line arguments for evaluate
 */
export function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const options = {
    outputDir: null,
    evalAgent: 'claude-code',
    skipNonDeterministic: false,
    clean: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--eval-agent':
        options.evalAgent = next || 'claude-code';
        i++;
        break;
      case '--skip-dynamic':
      case '--skip-flexible': // Backward compatibility
        options.skipNonDeterministic = true;
        break;
      case '--clean':
        options.clean = true;
        break;
      default:
        if (!options.outputDir && !arg.startsWith('--')) {
          options.outputDir = arg;
        }
        break;
    }
    i++;
  }

  if (!options.outputDir) {
    console.error('Error: Output directory is required');
    showHelp();
    process.exit(1);
  }

  if (!existsSync(options.outputDir)) {
    console.error(`Error: Output directory does not exist: ${options.outputDir}`);
    process.exit(1);
  }

  return options;
}

/**
 * Show help message
 */
export function showHelp() {
  console.log(`
Evaluation Script for Agent Skills Tests

Usage:
  ./tools/evaluate.js <output-dir> [options]

Arguments:
  <output-dir>          Path to test results directory

Options:
  --eval-agent <agent>  Agent to use for dynamic evaluation (default: claude-code)
  --skip-dynamic        Generate prompt but skip agent invocation (useful for review)
  --clean               Remove evaluation artifacts and exit (cleanup only)
  --help                Show this help message

Examples:
  # Evaluate all tasks and agents from a run
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z

  # Evaluate specific task across all agents
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z/create-simple-block

  # Evaluate specific agent for specific task
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z/create-simple-block/claude-code

  # Skip dynamic evaluation (generates prompt but doesn't run agent)
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z --skip-dynamic

  # Use specific agent for dynamic evaluation
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z --eval-agent cursor-cli

  # Clean evaluation artifacts (cleanup only, does not run evaluation)
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z --clean
`);
}
