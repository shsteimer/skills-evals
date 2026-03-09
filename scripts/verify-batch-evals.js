import fs from 'fs/promises';
import path from 'path';

/**
 * Scan a batch directory and report which runs are missing eval-result.json.
 * A "run" is a subdirectory containing task.json.
 */
export async function verifyBatchEvals(batchDir) {
  const targetDir = path.resolve(batchDir);
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory());

  const missingEvals = [];
  let totalRuns = 0;
  let evaluatedCount = 0;

  for (const dir of dirs) {
    const runDir = path.join(targetDir, dir.name);

    // Only count directories that are actual runs (have task.json)
    try {
      await fs.access(path.join(runDir, 'task.json'));
    } catch {
      continue;
    }

    totalRuns++;

    try {
      await fs.access(path.join(runDir, 'eval-result.json'));
      evaluatedCount++;
    } catch {
      missingEvals.push(dir.name);
    }
  }

  return {
    totalRuns,
    evaluatedCount,
    missingEvals,
    allEvaluated: missingEvals.length === 0
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const batchDir = process.argv[2];

  if (!batchDir) {
    console.error('Usage: node scripts/verify-batch-evals.js <batch-dir>');
    process.exit(1);
  }

  const result = await verifyBatchEvals(batchDir);

  console.log(`Batch: ${path.resolve(batchDir)}`);
  console.log(`Total runs: ${result.totalRuns}`);
  console.log(`Evaluated: ${result.evaluatedCount}`);
  console.log(`Missing: ${result.missingEvals.length}`);

  if (result.missingEvals.length > 0) {
    console.log('\nMissing eval-result.json:');
    for (const name of result.missingEvals) {
      console.log(`  ${name}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll runs have been evaluated.');
  }
}
