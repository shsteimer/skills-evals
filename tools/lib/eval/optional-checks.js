import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Run optional static evaluation criteria
 */
export async function runOptionalChecks(outputDir, testDef) {
  console.log('\n=== Running Optional Checks ===\n');

  const results = {
    warnings: [],
    checks: {},
  };

  const checks = testDef.optional_checks || {};

  // Optional file checks
  if (checks.files_exist) {
    console.log('Checking optional files...');
    for (const file of checks.files_exist) {
      const filePath = join(outputDir, file);
      const exists = existsSync(filePath);
      results.checks[`optional_file:${file}`] = exists;

      if (!exists) {
        results.warnings.push(`Optional file does not exist: ${file}`);
        console.log(`  ⚠ ${file} (missing but optional)`);
      } else {
        console.log(`  ✓ ${file}`);
      }
    }
  }

  return results;
}
