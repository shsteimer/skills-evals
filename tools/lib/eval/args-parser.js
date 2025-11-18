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
    cleanOnly: false,
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
        // If --clean is the only flag, mark as cleanOnly
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

  // Determine if --clean is the only operation (cleanup and exit)
  if (options.clean && !options.skipNonDeterministic && options.evalAgent === 'claude-code') {
    // Check if no other flags were specified (only --clean)
    const otherFlags = args.filter((a) => a.startsWith('--') && a !== '--clean');
    if (otherFlags.length === 0) {
      options.cleanOnly = true;
    }
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
  --skip-dynamic        Skip dynamic evaluation (still runs cleanup, static, and prompt generation)
  --clean               Cleanup only, do not run evaluation
  --help                Show this help message

Workflow:
  No flags:        clean → static checks → generate prompt → run dynamic evaluation
  --clean:         clean only, exit
  --skip-dynamic:  clean → static checks → generate prompt (skip dynamic evaluation)

Examples:
  # Evaluate all tasks and agents from a run
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z

  # Evaluate specific task across all agents
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z/create-simple-block

  # Evaluate specific agent for specific task
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z/create-simple-block/claude-code

  # Full evaluation (clean, static, prompt, dynamic)
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z

  # Cleanup only
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z --clean

  # Everything except dynamic evaluation (clean, static, prompt)
  ./tools/evaluate.js evaluations/2025-01-14T10:00:00Z --skip-dynamic
`);
}
