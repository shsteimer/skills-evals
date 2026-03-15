#!/usr/bin/env node
/**
 * Assemble the eval subagent prompt from template + run data.
 *
 * Usage: node scripts/assemble-eval-prompt.js <result-folder> <workspace-path> <port>
 *
 * Reads:
 *   - .claude/skills/eval-run/resources/eval-prompt.template.md
 *   - task.json, prompt.txt, criteria.txt from the result folder
 *   - check-resolved-criteria.json from the result folder (if exists)
 *   - run-metrics.json from the result folder (if exists)
 *
 * Prints the assembled prompt to stdout.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function readOr(filePath, fallback) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return fallback;
  }
}

async function assembleEvalPrompt(resultFolder, workspacePath, port) {
  const template = await fs.readFile(
    path.join(projectRoot, '.claude/skills/eval-run/resources/eval-prompt.template.md'),
    'utf-8',
  );

  const taskJson = JSON.parse(await fs.readFile(path.join(resultFolder, 'task.json'), 'utf-8'));
  const promptTxt = await readOr(path.join(resultFolder, 'prompt.txt'), '(no prompt found)');
  const criteriaTxt = await readOr(path.join(resultFolder, 'criteria.txt'), '(no criteria found)');

  // Strip [check: ...] lines from criteria so the subagent only sees what it needs to evaluate
  const criteriaWithoutChecks = criteriaTxt
    .split('\n')
    .filter((line) => !line.match(/\[check:\s*[^\]]+\]/))
    .join('\n');

  // Load resolved checks
  let resolvedChecks = [];
  try {
    resolvedChecks = JSON.parse(
      await fs.readFile(path.join(resultFolder, 'check-resolved-criteria.json'), 'utf-8'),
    );
  } catch {
    // no resolved checks
  }

  const resolvedText = resolvedChecks.length > 0
    ? resolvedChecks
      .map((c) => `- [${c.met ? 'MET' : 'NOT MET'}] (${c.priority}, ${c.points}pts) ${c.name}: ${c.notes}`)
      .join('\n')
    : '(no automated checks for this task)';

  // Build additional context
  const contextParts = [];

  const runMetrics = await readOr(path.join(resultFolder, 'run-metrics.json'), null);
  if (runMetrics) {
    const metrics = JSON.parse(runMetrics);
    if (metrics.timedOut) {
      contextParts.push(
        '- **This run timed out.** The agent did not finish within the time limit. Evaluate the '
        + 'partial work that exists — partial credit is valid. Note the timeout prominently in your '
        + 'summary, and consider it when judging criteria: incomplete work due to timeout is different '
        + 'from the agent choosing not to do something.',
      );
    }
  }

  const testResults = await readOr(path.join(resultFolder, 'test-results.json'), null);
  if (testResults) {
    try {
      const tests = JSON.parse(testResults);
      const status = tests.success ? 'passed' : 'failed';
      contextParts.push(`- Tests: ${status} — ${tests.summary || JSON.stringify(tests)}`);
    } catch {
      contextParts.push(`- Tests: ${testResults.trim()}`);
    }
  }

  const additionalContext = contextParts.length > 0
    ? contextParts.join('\n')
    : '(none)';

  // Fill template
  const prompt = template
    .replaceAll('{{task_name}}', taskJson.name)
    .replaceAll('{{task_description}}', taskJson.description || '')
    .replaceAll('{{prompt_txt}}', promptTxt.trim())
    .replaceAll('{{criteria_without_checks}}', criteriaWithoutChecks.trim())
    .replaceAll('{{workspace_path}}', workspacePath)
    .replaceAll('{{resolved_checks}}', resolvedText)
    .replaceAll('{{additional_context}}', additionalContext)
    .replaceAll('{{result_folder}}', resultFolder)
    .replaceAll('{{port}}', String(port));

  return prompt;
}

// CLI entry point
const resultFolder = process.argv[2];
const workspacePath = process.argv[3];
const port = process.argv[4] || '3001';

if (!resultFolder || !workspacePath) {
  console.error('Usage: node scripts/assemble-eval-prompt.js <result-folder> <workspace-path> [port]');
  process.exit(1);
}

const prompt = await assembleEvalPrompt(path.resolve(resultFolder), workspacePath, port);
console.log(prompt);
