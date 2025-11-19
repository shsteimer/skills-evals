#!/usr/bin/env node

/**
 * Test Runner for Agent Skills Evaluation Framework
 *
 * Usage:
 *   ./tools/run-tasks.js --task <task-name>
 *   ./tools/run-tasks.js --tags <tag1,tag2>
 *   ./tools/run-tasks.js --skills <skill1,skill2>
 *
 * Options:
 *   --task <name>         Run specific task(s) by name (supports wildcards)
 *   --tags <tags>         Run tasks matching these tags (comma-separated)
 *   --skills <skills>     Run tasks using these skills (comma-separated)
 *   --agents <agents>     Agent(s) to test with (default: all agents)
 *                         Options: claude-code, cursor-cli, codex-cli
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseArgs, validateArgs } from './lib/cli/args-parser.js';
import { checkAgentAvailability } from './lib/cli/agent-checker.js';
import { findAllTests, loadTest, filterTests } from './lib/tasks/discovery.js';
import { runTestWithAgent } from './lib/tasks/executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const TASKS_DIR = join(ROOT_DIR, 'tasks');
const EVALUATIONS_DIR = join(ROOT_DIR, 'evaluations');

/**
 * Main execution
 */
async function main() {
  console.log('Agent Skills Evaluation Framework - Test Runner\n');

  const options = parseArgs();
  await validateArgs(options, checkAgentAvailability);

  console.log('Configuration:');
  if (options.test) console.log(`  Task: ${options.test}`);
  if (options.tags.length > 0) console.log(`  Tags: ${options.tags.join(', ')}`);
  if (options.skills.length > 0) console.log(`  Skills: ${options.skills.join(', ')}`);
  console.log(`  Agents: ${options.agents.join(', ')}`);
  console.log('');

  // Discover all tests
  console.log('Discovering tests...');
  const allTestDirs = findAllTests(TASKS_DIR);
  console.log(`  Found ${allTestDirs.length} test(s)`);

  // Load all tests
  const allTests = allTestDirs.map((dir) => loadTest(dir, ROOT_DIR));

  // Filter tests
  const testsToRun = filterTests(allTests, options);
  console.log(`  ${testsToRun.length} test(s) match criteria`);

  if (testsToRun.length === 0) {
    console.log('\nNo tests to run.');
    process.exit(0);
  }

  // Create a single timestamp for this entire run_tasks execution
  const timestamp = new Date().toISOString();
  console.log(`\nRun timestamp: ${timestamp}`);
  console.log(`Results will be saved to: evaluations/${timestamp}/\n`);

  // Run each test with each agent
  const results = [];
  for (const test of testsToRun) {
    for (const agent of options.agents) {
      const result = await runTestWithAgent(
        test, agent, options.setupOnly, timestamp, EVALUATIONS_DIR,
      );
      results.push({
        test: test.name,
        agent,
        ...result,
      });
    }
  }

  if (options.setupOnly) {
    console.log('\n=== Setup Complete ===');
    console.log('Test environments are ready. Run the commands above to execute tests manually.');
    console.log('\nNote: Worktrees and branches are NOT cleaned up in setup-only mode.');
    console.log('Use the cleanup commands shown above when you\'re done testing.');
    return;
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total test runs: ${results.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`Failed/Pending: ${results.filter((r) => !r.success).length}`);

  console.log('\nNext steps:');
  console.log('  1. Review task outputs in evaluations/');
  console.log('  2. Run evaluation: ./tools/evaluate.js <output-dir>');
  console.log('     Options: --eval-agent <agent>, --skip-dynamic');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
