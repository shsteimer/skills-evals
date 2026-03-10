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
 *   - check-unresolved-criteria.json to the result folder
 */
import fs from 'fs/promises';
import path from 'path';

function scoreForPriority(priority, passed) {
  if (!passed) {
    return 0;
  }
  if (priority === 'critical') {
    return 2;
  }
  if (priority === 'important') {
    return 1;
  }
  return 0;
}

export async function resolveChecks(resultFolder) {
  const criteria = await fs.readFile(path.join(resultFolder, 'criteria.txt'), 'utf-8');

  // Read check results
  let checks = [];
  try {
    checks = JSON.parse(await fs.readFile(path.join(resultFolder, 'check-results.json'), 'utf-8'));
  } catch {
    // No checks file — all check-linked criteria remain unresolved.
  }

  const checkMap = {};
  for (const c of checks) {
    checkMap[c.name] = c;
  }

  const resolved = [];
  const unresolved = [];
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
        resolved.push({
          name: criterionText,
          section,
          priority,
          met: check.passed,
          points: scoreForPriority(priority, check.passed),
          notes: check.evidence,
          source: 'check',
        });
      } else {
        unresolved.push({
          name: criterionText,
          section,
          priority,
          checkName,
          source: 'check',
        });
      }
    }
  }

  return { resolved, unresolved };
}

export async function writeCheckResolutionFiles(resultFolder, resolution = null) {
  const result = resolution || await resolveChecks(resultFolder);

  await fs.writeFile(
    path.join(resultFolder, 'check-resolved-criteria.json'),
    JSON.stringify(result.resolved, null, 2),
  );
  await fs.writeFile(
    path.join(resultFolder, 'check-unresolved-criteria.json'),
    JSON.stringify(result.unresolved, null, 2),
  );

  return result;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const resultFolder = process.argv[2];
  if (!resultFolder) {
    console.error('Usage: node scripts/resolve-checks.js <result-folder>');
    process.exit(1);
  }

  writeCheckResolutionFiles(path.resolve(resultFolder))
    .then(() => console.log('Done'))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
