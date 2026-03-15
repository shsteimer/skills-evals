#!/usr/bin/env node
/**
 * Resolve check-linked criteria from criteria.txt using check-results.json.
 *
 * Usage: node scripts/resolve-checks.js <result-folder>
 *
 * Reads:
 *   - criteria.txt from the result folder
 *   - check-results.json from the result folder
 *   - task.json to determine the task name (for finding criteria.txt)
 *
 * Writes:
 *   - check-resolved-criteria.json to the result folder
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function resolveChecks(resultFolder) {
  const taskJson = JSON.parse(await fs.readFile(path.join(resultFolder, 'task.json'), 'utf-8'));
  const taskName = taskJson.name;

  // Read criteria from task definition
  const criteriaPath = path.join(__dirname, '..', 'tasks', taskName, 'criteria.txt');
  const criteria = await fs.readFile(criteriaPath, 'utf-8');

  // Read check results
  let checks = [];
  try {
    checks = JSON.parse(await fs.readFile(path.join(resultFolder, 'check-results.json'), 'utf-8'));
  } catch {
    // No checks — write empty resolved file
    await fs.writeFile(path.join(resultFolder, 'check-resolved-criteria.json'), '[]');
    return;
  }

  const checkMap = {};
  for (const c of checks) {
    checkMap[c.name] = c;
  }

  const resolved = [];
  const lines = criteria.split('\n');
  let section = '';
  let priority = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      section = line.replace('## ', '').trim();
      continue;
    }
    if (line.includes('<critical>')) { priority = 'critical'; continue; }
    if (line.includes('<important>')) { priority = 'important'; continue; }
    if (line.includes('<bonus>')) { priority = 'bonus'; continue; }
    if (line.includes('</critical>') || line.includes('</important>') || line.includes('</bonus>')) continue;

    const checkMatch = line.match(/\[check:\s*([^\]]+)\]/);
    if (checkMatch) {
      const checkName = checkMatch[1].trim();
      const check = checkMap[checkName];
      const criterionText = line.replace(/^-\s*/, '').replace(/\[check:.*\]/, '').trim();

      if (check) {
        const points = priority === 'critical'
          ? (check.passed ? 2 : 0)
          : priority === 'important'
            ? (check.passed ? 1 : 0)
            : 0;

        resolved.push({
          name: criterionText,
          section,
          priority,
          met: check.passed,
          points,
          notes: check.evidence,
          source: 'check',
        });
      }
    }
  }

  await fs.writeFile(
    path.join(resultFolder, 'check-resolved-criteria.json'),
    JSON.stringify(resolved, null, 2),
  );
}

// CLI entry point
const resultFolder = process.argv[2];
if (!resultFolder) {
  console.error('Usage: node scripts/resolve-checks.js <result-folder>');
  process.exit(1);
}

resolveChecks(path.resolve(resultFolder))
  .then(() => console.log('Done'))
  .catch((err) => { console.error(err.message); process.exit(1); });
