#!/usr/bin/env node
/**
 * Assemble the compare-batches subagent prompt from template + comparison data.
 *
 * Usage: node scripts/assemble-compare-prompt.js <comparison-dir>
 *
 * Reads:
 *   - .claude/skills/compare-batches/resources/compare-prompt.template.md
 *   - comparison.json from the comparison directory
 *
 * Prints the assembled prompt to stdout.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function assembleComparePrompt(comparisonDir) {
  const template = await fs.readFile(
    path.join(projectRoot, '.claude/skills/compare-batches/resources/compare-prompt.template.md'),
    'utf-8',
  );

  const comparison = JSON.parse(
    await fs.readFile(path.join(comparisonDir, 'comparison.json'), 'utf-8'),
  );

  const comparisonData = await fs.readFile(path.join(comparisonDir, 'comparison.json'), 'utf-8');

  const prompt = template
    .replaceAll('{{comparison_data}}', comparisonData.trim())
    .replaceAll('{{baseline_dir}}', comparison.baselineDir || '')
    .replaceAll('{{candidate_dir}}', comparison.candidateDir || '');

  return prompt;
}

// CLI entry point
const comparisonDir = process.argv[2];

if (!comparisonDir) {
  console.error('Usage: node scripts/assemble-compare-prompt.js <comparison-dir>');
  process.exit(1);
}

const prompt = await assembleComparePrompt(path.resolve(comparisonDir));
console.log(prompt);
