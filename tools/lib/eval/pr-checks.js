import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

/**
 * Check PR quality if PR was opened
 */
export async function checkPRQuality(outputDir, testDef, projectRoot) {
  console.log('\n=== Checking PR Quality ===\n');

  const results = {
    pr_opened: false,
    pr_url: null,
    pr_quality: {},
    failures: [],
  };

  // Try to detect PR from git branch
  try {
    // Get the branch name from the output directory
    const agentInfoPath = join(outputDir, 'agent-info.json');
    let branchName = null;

    if (existsSync(agentInfoPath)) {
      const agentInfo = JSON.parse(readFileSync(agentInfoPath, 'utf8'));
      branchName = agentInfo.branch;
    }

    if (!branchName) {
      console.log('  ℹ Could not determine branch name');
      console.log('  ℹ No PR opened (no penalty)');
      return results;
    }

    // Check if a PR exists for this branch using gh CLI
    try {
      const prListResult = spawnSync('gh', ['pr', 'list', '--head', branchName, '--json', 'url,number,state'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      if (prListResult.status === 0 && prListResult.stdout.trim()) {
        const prs = JSON.parse(prListResult.stdout);
        if (prs && prs.length > 0) {
          const pr = prs[0];
          results.pr_opened = true;
          results.pr_url = pr.url;
          console.log(`  ✓ PR detected: ${pr.url}`);

          // Run quality checks if PR was opened
          const checks = testDef.pr_quality_checks || {};

          // Check CI/CD status
          if (checks.checks_pass !== false) {
            console.log('\n  Checking CI/CD status...');
            const checksResult = spawnSync('gh', ['pr', 'checks', pr.number.toString()], {
              cwd: projectRoot,
              encoding: 'utf8',
              stdio: 'pipe',
            });

            if (checksResult.status === 0) {
              const output = checksResult.stdout;
              const failedChecks = output.split('\n').filter((line) => line.includes('fail'));
              if (failedChecks.length > 0) {
                results.pr_quality.checks_pass = false;
                results.failures.push('PR has failing checks');
                console.log('    ✗ Some checks failed');
                failedChecks.forEach((check) => console.log(`      - ${check.trim()}`));
              } else {
                results.pr_quality.checks_pass = true;
                console.log('    ✓ All checks passing');
              }
            }
          }

          // Check for preview link in PR body
          if (checks.has_preview_link !== false) {
            console.log('\n  Checking for preview link...');
            const prViewResult = spawnSync('gh', ['pr', 'view', pr.number.toString(), '--json', 'body'], {
              cwd: projectRoot,
              encoding: 'utf8',
              stdio: 'pipe',
            });

            if (prViewResult.status === 0) {
              const prData = JSON.parse(prViewResult.stdout);
              const body = prData.body || '';

              const previewLinkMatch = body.match(/https?:\/\/[a-zA-Z0-9-]+--[a-zA-Z0-9-]+--[a-zA-Z0-9-]+\.aem\.(page|live)/);
              if (previewLinkMatch) {
                results.pr_quality.has_preview_link = true;
                [results.pr_quality.preview_url] = previewLinkMatch;
                console.log(`    ✓ Preview link found: ${previewLinkMatch[0]}`);
              } else {
                results.pr_quality.has_preview_link = false;
                results.failures.push('PR missing preview link');
                console.log('    ✗ No preview link found');
              }
            }
          }

          // Check if preview link is valid
          if (checks.preview_valid !== false && results.pr_quality.preview_url) {
            console.log('\n  Checking preview link validity...');
            try {
              const curlResult = spawnSync('curl', ['-I', '-s', '-o', '/dev/null', '-w', '%{http_code}', results.pr_quality.preview_url], {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 10000,
              });

              const statusCode = parseInt(curlResult.stdout.trim(), 10);
              if (statusCode >= 200 && statusCode < 400) {
                results.pr_quality.preview_valid = true;
                console.log(`    ✓ Preview link returns ${statusCode}`);
              } else {
                results.pr_quality.preview_valid = false;
                results.failures.push(`Preview link returns ${statusCode}`);
                console.log(`    ✗ Preview link returns ${statusCode}`);
              }
            } catch (error) {
              results.pr_quality.preview_valid = false;
              results.failures.push('Preview link check timed out or failed');
              console.log('    ✗ Could not validate preview link');
            }
          }
        } else {
          console.log('  ℹ No PR found for this branch');
          console.log('  ℹ No PR opened (no penalty)');
        }
      }
    } catch (error) {
      console.log('  ℹ Error checking for PR (gh CLI might not be available)');
      console.log(`  ℹ ${error.message}`);
    }
  } catch (error) {
    console.log('  ℹ Error in PR quality check');
    console.log(`  ℹ ${error.message}`);
  }

  return results;
}
