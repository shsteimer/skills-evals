import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

/**
 * Run static evaluation criteria (required)
 */
export async function runStaticChecks(outputDir, testDef) {
  console.log('\n=== Running Deterministic Checks ===\n');

  const results = {
    passed: true,
    failures: [],
    checks: {},
  };

  const checks = testDef.static_criteria || {};

  // Check if required files exist
  if (checks.files_exist) {
    console.log('Checking required files...');

    const diffPath = join(outputDir, 'code-diff.patch');
    let diffContent = '';
    if (existsSync(diffPath)) {
      diffContent = readFileSync(diffPath, 'utf8');
    }

    for (const file of checks.files_exist) {
      const fileInDiff = diffContent.includes(`+++ b/${file}`) || diffContent.includes(`diff --git a/${file}`);
      results.checks[`file_exists:${file}`] = fileInDiff;

      if (!fileInDiff) {
        results.passed = false;
        results.failures.push(`Required file does not exist: ${file}`);
        console.log(`  ✗ ${file} (MISSING)`);
      } else {
        console.log(`  ✓ ${file}`);
      }
    }
  }

  // Check if files should NOT exist
  if (checks.files_not_exist) {
    console.log('\nChecking files that should not exist...');

    const diffPath = join(outputDir, 'code-diff.patch');
    let diffContent = '';
    if (existsSync(diffPath)) {
      diffContent = readFileSync(diffPath, 'utf8');
    }

    for (const file of checks.files_not_exist) {
      const fileInDiff = diffContent.includes(`+++ b/${file}`) || diffContent.includes(`diff --git a/${file}`);
      results.checks[`file_not_exists:${file}`] = !fileInDiff;

      if (fileInDiff) {
        results.passed = false;
        results.failures.push(`File should not exist: ${file}`);
        console.log(`  ✗ ${file} (EXISTS)`);
      } else {
        console.log(`  ✓ ${file} (correctly absent)`);
      }
    }
  }

  // Check linting results
  if (checks.lint_passes) {
    console.log('\nChecking linting results...');
    const lintResultPath = join(outputDir, 'lint-result.json');

    if (existsSync(lintResultPath)) {
      try {
        const lintResult = JSON.parse(readFileSync(lintResultPath, 'utf8'));
        results.checks.lint_passes = lintResult.passed;

        if (lintResult.passed) {
          console.log('  ✓ Linting passed');
        } else {
          results.passed = false;
          results.failures.push('Linting failed');
          console.log('  ✗ Linting failed');
          if (lintResult.output) {
            const lines = lintResult.output.split('\n').slice(0, 10);
            lines.forEach((line) => console.log(`    ${line}`));
            if (lintResult.output.split('\n').length > 10) {
              console.log('    ... (see lint-output.txt for full output)');
            }
          }
        }
      } catch (e) {
        console.log(`  ⚠ Could not parse lint results: ${e.message}`);
        results.checks.lint_passes = false;
      }
    } else {
      console.log('  ⚠ Lint results not found (linting may not have run)');
      results.checks.lint_passes = false;
    }
  }

  // Check for forbidden patterns
  if (checks.forbidden_patterns) {
    console.log('\nChecking for forbidden patterns...');

    const diffPath = join(outputDir, 'code-diff.patch');
    let diffContent = '';
    if (existsSync(diffPath)) {
      diffContent = readFileSync(diffPath, 'utf8');
    }

    for (const check of checks.forbidden_patterns) {
      const { pattern } = check;
      const inFiles = check.in_files || ['**/*'];

      let found = false;
      const foundIn = [];

      // Split diff into file sections
      const fileSections = diffContent.split(/^diff --git /m).slice(1);

      for (const section of fileSections) {
        const fileMatch = section.match(/^a\/(.+?) b\/(.+?)$/m);
        if (!fileMatch) continue;

        const fileName = fileMatch[2];

        // Check if file matches any of the globs
        const matchesGlob = inFiles.some((glob) => {
          if (glob === '**/*') return true;
          const globRegex = new RegExp(`^${glob.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
          return globRegex.test(fileName);
        });

        if (!matchesGlob) continue;

        // Extract added lines
        const lines = section.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            const regex = new RegExp(pattern);
            if (regex.test(line)) {
              found = true;
              if (!foundIn.includes(fileName)) {
                foundIn.push(fileName);
              }
            }
          }
        }
      }

      if (found) {
        results.passed = false;
        results.failures.push(`Forbidden pattern found: "${pattern}" in ${foundIn.join(', ')}`);
        results.checks[`forbidden_pattern:${pattern}`] = false;
        console.log(`  ✗ Pattern "${pattern}" found in:`);
        foundIn.forEach((f) => console.log(`    - ${f}`));
      } else {
        results.checks[`forbidden_pattern:${pattern}`] = true;
        console.log(`  ✓ Pattern "${pattern}" not found`);
      }
    }
  }

  // Check for required patterns
  if (checks.required_patterns) {
    console.log('\nChecking for required patterns...');

    const diffPath = join(outputDir, 'code-diff.patch');
    let diffContent = '';
    if (existsSync(diffPath)) {
      diffContent = readFileSync(diffPath, 'utf8');
    }

    for (const check of checks.required_patterns) {
      const { pattern } = check;
      const inFiles = check.in_files || ['**/*'];

      let found = false;
      const foundIn = [];

      const fileSections = diffContent.split(/^diff --git /m).slice(1);

      for (const section of fileSections) {
        const fileMatch = section.match(/^a\/(.+?) b\/(.+?)$/m);
        if (!fileMatch) continue;

        const fileName = fileMatch[2];

        const matchesGlob = inFiles.some((glob) => {
          if (glob === '**/*') return true;
          const globRegex = new RegExp(`^${glob.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
          return globRegex.test(fileName);
        });

        if (!matchesGlob) continue;

        const lines = section.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            const regex = new RegExp(pattern);
            if (regex.test(line)) {
              found = true;
              if (!foundIn.includes(fileName)) {
                foundIn.push(fileName);
              }
            }
          }
        }
      }

      if (!found) {
        results.passed = false;
        results.failures.push(`Required pattern not found: "${pattern}"`);
        results.checks[`required_pattern:${pattern}`] = false;
        console.log(`  ✗ Pattern "${pattern}" not found`);
      } else {
        results.checks[`required_pattern:${pattern}`] = true;
        console.log(`  ✓ Pattern "${pattern}" found in ${foundIn.join(', ')}`);
      }
    }
  }

  // Run custom scripts
  if (checks.custom_scripts) {
    console.log('\nRunning custom scripts...');

    for (const script of checks.custom_scripts) {
      const scriptName = script.name || script.script;
      const scriptCommand = script.script;
      const workingDir = script.cwd || outputDir;

      console.log(`  Running: ${scriptName}`);

      try {
        const result = spawnSync('bash', ['-c', scriptCommand], {
          cwd: workingDir,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: script.timeout || 30000,
        });

        const passed = result.status === 0;
        results.checks[`custom_script:${scriptName}`] = passed;

        if (passed) {
          console.log(`    ✓ ${scriptName} passed`);
        } else {
          results.passed = false;
          results.failures.push(`Custom script failed: ${scriptName}`);
          console.log(`    ✗ ${scriptName} failed`);
          if (result.stderr) {
            const lines = result.stderr.split('\n').slice(0, 5);
            lines.forEach((line) => console.log(`      ${line}`));
          }
        }
      } catch (error) {
        results.passed = false;
        results.failures.push(`Custom script error: ${scriptName} - ${error.message}`);
        results.checks[`custom_script:${scriptName}`] = false;
        console.log(`    ✗ ${scriptName} error: ${error.message}`);
      }
    }
  }

  return results;
}
