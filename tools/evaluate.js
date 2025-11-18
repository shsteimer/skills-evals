#!/usr/bin/env node

/**
 * Evaluation Script for Agent Skills Tests
 *
 * Usage:
 *   ./tools/evaluate.js <output-dir> [options]
 *
 * Arguments:
 *   <output-dir>          Path to test results directory
 *
 * Options:
 *   --eval-agent <agent>  Agent to use for dynamic evaluation (default: claude-code)
 *   --skip-dynamic        Skip dynamic evaluation (still runs cleanup, static, and
 *                         prompt generation)
 *   --clean               Cleanup only, do not run evaluation
 *   --help                Show this help message
 *
 * Workflow:
 *   No flags:        clean → static checks → generate prompt → run dynamic evaluation
 *   --clean:         clean only, exit
 *   --skip-dynamic:  clean → static checks → generate prompt (skip dynamic evaluation)
 */

import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { parseArgs } from './lib/eval/args-parser.js';
import { loadTestDefinition } from './lib/eval/test-loader.js';
import { detectPathType, getTaskDirectories, getAgentDirectoriesForTask } from './lib/eval/path-resolver.js';
import { runStaticChecks } from './lib/eval/static-checks.js';
import { runOptionalChecks } from './lib/eval/optional-checks.js';
import { checkPRQuality } from './lib/eval/pr-checks.js';
import { runDynamicEvaluation } from './lib/eval/dynamic-eval.js';
import { generateOutputs } from './lib/eval/report-generator.js';
import { cleanDirectory } from './lib/eval/cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * Evaluate a single agent's results
 */
async function evaluateSingleAgent(agentDir, testDef, options) {
  const agent = basename(agentDir);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Evaluating: ${agent}`);
  console.log('='.repeat(60));

  // Run evaluations
  const staticResults = await runStaticChecks(agentDir, testDef);
  const optionalResults = await runOptionalChecks(agentDir, testDef);
  const prResults = await checkPRQuality(agentDir, testDef, PROJECT_ROOT);

  // Always run dynamic evaluation (generates prompt), but may skip agent invocation
  const dynamicAssessment = await runDynamicEvaluation(
    agentDir,
    testDef,
    options.evalAgent,
    options.skipNonDeterministic,
  );

  // Combine results
  const evaluationResults = {
    task_name: testDef.name,
    test_definition_name: testDef.name,
    agent,
    evaluator: options.evalAgent,
    static_results: staticResults,
    optional_results: optionalResults,
    pr_results: prResults,
    dynamic_assessment: dynamicAssessment,
  };

  // Generate outputs
  const { jsonPath, mdPath } = generateOutputs(agentDir, evaluationResults);

  console.log(`\nStatus: ${staticResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('Results saved to:');
  console.log(`  - ${jsonPath}`);
  console.log(`  - ${mdPath}`);

  return {
    agent,
    passed: staticResults.passed,
    results: evaluationResults,
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    const options = parseArgs();

    console.log('='.repeat(60));
    console.log('Agent Skills Test Evaluation');
    console.log('='.repeat(60));
    console.log(`\nOutput Directory: ${options.outputDir}`);
    console.log(`Eval Agent: ${options.evalAgent}`);
    console.log(`Skip Dynamic: ${options.skipNonDeterministic}`);

    // Clean artifacts (always runs unless doing cleanup-only)
    console.log(`\n${'='.repeat(60)}`);
    console.log('Cleaning Evaluation Artifacts');
    console.log('='.repeat(60));
    const cleaned = cleanDirectory(options.outputDir);
    console.log(`\nCleaned ${cleaned} artifact(s)`);
    console.log('='.repeat(60));

    // If --clean was specified alone, exit after cleanup
    if (options.cleanOnly) {
      process.exit(0);
    }

    // Detect path type first
    const pathType = detectPathType(options.outputDir);
    console.log(`\nPath Type: ${pathType}`);

    let agentDirsToEvaluate = [];

    if (pathType === 'timestamp') {
      // evaluations/{timestamp} - evaluate all tasks and agents
      const taskDirs = getTaskDirectories(options.outputDir);
      console.log(`\nFound ${taskDirs.length} task(s)`);

      for (const taskDir of taskDirs) {
        const agentDirs = getAgentDirectoriesForTask(taskDir);
        agentDirsToEvaluate.push(...agentDirs);
      }
    } else if (pathType === 'task') {
      // evaluations/{timestamp}/{task-name} - evaluate all agents for this task
      agentDirsToEvaluate = getAgentDirectoriesForTask(options.outputDir);
    } else if (pathType === 'agent') {
      // evaluations/{timestamp}/{task-name}/{agent} - evaluate single agent
      agentDirsToEvaluate = [options.outputDir];
    } else {
      throw new Error(`Invalid path type: ${pathType}. Expected timestamp, task, or agent directory.`);
    }

    console.log(`\nEvaluating ${agentDirsToEvaluate.length} agent result(s)...\n`);

    // Evaluate each agent directory
    const allResults = [];

    for (const agentDir of agentDirsToEvaluate) {
      try {
        // Load test definition for this agent's task
        const testDef = loadTestDefinition(agentDir, PROJECT_ROOT);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Task: ${testDef.name}`);
        console.log(`Agent: ${basename(agentDir)}`);
        console.log('='.repeat(60));

        const result = await evaluateSingleAgent(agentDir, testDef, options);
        allResults.push(result);
      } catch (error) {
        console.error(`\n❌ Error evaluating ${agentDir}:`);
        console.error(`   ${error.message}`);
        allResults.push({
          agent: basename(agentDir),
          task: basename(dirname(agentDir)),
          passed: false,
          error: error.message,
        });
      }
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('Evaluation Summary');
    console.log('='.repeat(60));

    const grouped = {};
    for (const result of allResults) {
      const taskName = result.results?.task_name || result.task || 'unknown';
      if (!grouped[taskName]) {
        grouped[taskName] = [];
      }
      grouped[taskName].push(result);
    }

    for (const [taskName, results] of Object.entries(grouped)) {
      console.log(`\n${taskName}:`);
      for (const result of results) {
        const status = result.passed ? '✅ PASSED' : '❌ FAILED';
        console.log(`  ${result.agent}: ${status}`);
      }
    }

    // Exit with failure if any agent failed
    const allPassed = allResults.every((r) => r.passed);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Overall: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
    console.log('='.repeat(60));

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
