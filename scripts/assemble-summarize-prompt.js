#!/usr/bin/env node
/**
 * Assemble the summarize-batch subagent prompt from template + batch data.
 *
 * Usage: node scripts/assemble-summarize-prompt.js <batch-dir>
 *
 * Reads:
 *   - .claude/skills/summarize-batch/resources/summarize-prompt.template.md
 *   - batch-summary.json from the batch directory
 *
 * Prints the assembled prompt to stdout.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function assembleSummarizePrompt(batchDir) {
  const template = await fs.readFile(
    path.join(projectRoot, '.claude/skills/summarize-batch/resources/summarize-prompt.template.md'),
    'utf-8',
  );

  const batchSummary = await fs.readFile(path.join(batchDir, 'batch-summary.json'), 'utf-8');

  const prompt = template
    .replaceAll('{{batch_summary}}', batchSummary.trim())
    .replaceAll('{{batch_dir}}', batchDir);

  return prompt;
}

// CLI entry point
const batchDir = process.argv[2];

if (!batchDir) {
  console.error('Usage: node scripts/assemble-summarize-prompt.js <batch-dir>');
  process.exit(1);
}

const prompt = await assembleSummarizePrompt(path.resolve(batchDir));
console.log(prompt);
