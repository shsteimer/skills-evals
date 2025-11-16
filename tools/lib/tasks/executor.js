import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { sanitizeTestName } from '../utils/sanitize.js';
import { createTestBranch, createWorktree, cleanupWorktree } from '../git/branch-operations.js';
import { cleanupTestArtifacts } from '../git/artifact-cleanup.js';
import { installDependencies } from '../utils/dependencies.js';
import { buildAgentCommand } from '../agent/command-builder.js';
import { generateExecutionTranscript } from '../agent/transcript.js';
import { extractSkillsFromText, extractPRLink } from '../agent/output-processor.js';

const execAsync = promisify(exec);

/**
 * Setup agent execution (for --setup-only mode)
 */
async function setupAgentExecution(test, agent, worktreePath, timestamp, evaluationsDir) {
  const testDirName = sanitizeTestName(test.name);
  const outputDir = join(evaluationsDir, timestamp, testDirName, agent);

  // Create output directory
  mkdirSync(outputDir, { recursive: true });

  // Prepare the task prompt
  const taskPrompt = test.task;

  // Build agent command
  const { agentCommand } = buildAgentCommand(agent, taskPrompt, 'json');

  // Save test info
  const testInfo = {
    task_name: test.name,
    test_path: test._relativePath,
    agent,
    timestamp,
    task: taskPrompt,
    initial_state: test.initial_state || 'main',
    skills_expected: test.skills,
    tags: test.tags || [],
    worktree_path: worktreePath,
    output_dir: outputDir,
    setup_only: true,
  };

  writeFileSync(join(outputDir, 'test-info.json'), JSON.stringify(testInfo, null, 2));

  return {
    outputDir,
    command: agentCommand,
    success: null,
    message: 'Setup complete - manual execution required',
  };
}

/**
 * Execute the agent with the test task
 */
async function executeAgent(test, agent, worktreePath, timestamp, initialSha, evaluationsDir) {
  console.log(`  Executing ${agent} with task...`);

  const testDirName = sanitizeTestName(test.name);
  const outputDir = join(evaluationsDir, timestamp, testDirName, agent);

  // Create output directory
  mkdirSync(outputDir, { recursive: true });

  // Prepare the task prompt
  const taskPrompt = test.task;

  // Build agent command
  const { agentCommand } = buildAgentCommand(agent, taskPrompt, 'stream-json');

  console.log(`  Command: ${agentCommand}`);
  console.log(`  Working directory: ${worktreePath}`);
  console.log(`  Output directory: ${outputDir}`);

  // Save test info
  const testInfo = {
    task_name: test.name,
    test_path: test._relativePath,
    agent,
    timestamp,
    task: taskPrompt,
    initial_state: test.initial_state || 'main',
    skills_expected: test.skills,
    tags: test.tags || [],
    worktree_path: worktreePath,
    output_dir: outputDir,
  };

  writeFileSync(join(outputDir, 'test-info.json'), JSON.stringify(testInfo, null, 2));

  console.log('  Executing agent...');

  const startTime = Date.now();
  let success = false;
  let errorMessage = null;

  try {
    // Execute agent using spawn for real-time output
    const result = await new Promise((resolve, reject) => {
      const child = spawn(agentCommand, [], {
        cwd: worktreePath,
        timeout: 600000, // 10 minute timeout
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let lastOutputLine = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        const lines = data.toString().split('\n').filter((l) => l.trim());
        if (lines.length > 0) {
          lastOutputLine = lines[lines.length - 1].substring(0, 80);
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Print last output line every 5 seconds
      const progressInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        if (lastOutputLine) {
          process.stdout.write(`\r  [${elapsed}s] ${lastOutputLine}...`);
        } else {
          process.stdout.write(`\r  Running... ${elapsed}s`);
        }
      }, 5000);

      child.on('close', (code) => {
        clearInterval(progressInterval);
        process.stdout.write('\r\x1b[K'); // Clear the progress line

        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const error = new Error(`Agent exited with code ${code}`);
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      child.on('error', (error) => {
        clearInterval(progressInterval);
        process.stdout.write('\r\x1b[K');
        reject(error);
      });
    });

    const endTime = Date.now();
    const duration = endTime - startTime;
    const { stdout, stderr } = result;

    // Save raw output as JSONL
    writeFileSync(join(outputDir, 'stdout.jsonl'), stdout);
    writeFileSync(join(outputDir, 'stderr.txt'), stderr);

    // Generate human-readable transcript from JSONL
    try {
      const transcript = generateExecutionTranscript(stdout, agent);
      writeFileSync(join(outputDir, 'execution-transcript.txt'), transcript);
      console.log('  ✓ Generated execution transcript');
    } catch (e) {
      console.log('  Warning: Could not generate execution transcript:', e.message);
    }

    // Capture final code state (git diff from initial state)
    try {
      // First capture status before adding files
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        shell: '/bin/bash',
      });
      writeFileSync(join(outputDir, 'git-status.txt'), statusOutput);

      // Add all changes (tracked and untracked) to staging
      const files = statusOutput.trim().split('\n').filter((line) => line.trim());
      if (files.length > 0) {
        for (const line of files) {
          const filename = line.substring(3).trim();
          if (filename) {
            try {
              await execAsync(`git add "${filename.replace(/"/g, '\\"')}"`, {
                cwd: worktreePath,
                shell: '/bin/bash',
              });
            } catch (addError) {
              console.log(`  Warning: Could not add ${filename}: ${addError.message}`);
            }
          }
        }
      }

      // Commit any staged changes
      try {
        await execAsync('git commit -m "Capture final state for evaluation" --allow-empty', {
          cwd: worktreePath,
          shell: '/bin/bash',
        });
      } catch (commitError) {
        // No changes to commit, that's fine
      }

      // Create diff from initial state to current HEAD
      const { stdout: diffOutput } = await execAsync(`git diff ${initialSha} HEAD`, {
        cwd: worktreePath,
        shell: '/bin/bash',
      });
      writeFileSync(join(outputDir, 'code-diff.patch'), diffOutput);
    } catch (e) {
      console.log('  Warning: Could not capture git diff');
      console.log(`  ${e.message}`);
    }

    // Run linting before cleanup
    try {
      console.log('  Running linting...');
      const { stdout: lintOutput } = await execAsync('npm run lint', {
        cwd: worktreePath,
        shell: '/bin/bash',
      });
      writeFileSync(join(outputDir, 'lint-output.txt'), lintOutput);
      writeFileSync(join(outputDir, 'lint-result.json'), JSON.stringify({
        passed: true,
        output: lintOutput,
      }, null, 2));
      console.log('  ✓ Linting passed');
    } catch (e) {
      const lintOutput = e.stdout || e.stderr || e.message;
      writeFileSync(join(outputDir, 'lint-output.txt'), lintOutput);
      writeFileSync(join(outputDir, 'lint-result.json'), JSON.stringify({
        passed: false,
        output: lintOutput,
        error: e.message,
      }, null, 2));
      console.log('  ⚠ Linting failed (results saved)');
    }

    // Extract skills used and PR link
    const transcript = `${stdout}\n${stderr}`;
    const skillsUsed = extractSkillsFromText(transcript);
    const prLink = extractPRLink(transcript);

    // Update test info with results
    testInfo.skills_used = skillsUsed;
    testInfo.pr_link = prLink || null;
    testInfo.duration_ms = duration;
    testInfo.completed_at = new Date(endTime).toISOString();

    writeFileSync(join(outputDir, 'test-info.json'), JSON.stringify(testInfo, null, 2));

    success = true;
    console.log(`  ✓ Agent completed in ${(duration / 1000).toFixed(1)}s`);
    if (skillsUsed.length > 0) {
      console.log(`  Skills used: ${skillsUsed.join(', ')}`);
    }
    if (prLink) {
      console.log(`  PR: ${prLink}`);
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    errorMessage = error.message;
    console.error(`  ✗ Agent failed: ${errorMessage}`);

    // Save error details
    writeFileSync(join(outputDir, 'error.txt'), `${errorMessage}\n\n${error.stack || ''}`);
    if (error.stdout) writeFileSync(join(outputDir, 'stdout.txt'), error.stdout);
    if (error.stderr) writeFileSync(join(outputDir, 'stderr.txt'), error.stderr);

    testInfo.error = errorMessage;
    testInfo.duration_ms = duration;
    testInfo.completed_at = new Date(endTime).toISOString();
    writeFileSync(join(outputDir, 'test-info.json'), JSON.stringify(testInfo, null, 2));
  }

  return {
    outputDir,
    success,
    message: success ? 'Agent completed successfully' : errorMessage,
  };
}

/**
 * Run a single test with a single agent
 */
export async function runTestWithAgent(test, agent, setupOnly, timestamp, evaluationsDir) {
  console.log(`\nRunning task: ${test.name}`);
  console.log(`  Path: ${test._relativePath}`);
  console.log(`  Agent: ${agent}`);

  let branchName; let worktreePath; let
    initialSha;

  try {
    // Create branch
    branchName = await createTestBranch(test);

    // Create worktree
    worktreePath = await createWorktree(branchName);

    // Remove test artifacts from the branch
    await cleanupTestArtifacts(worktreePath);

    // Capture SHA AFTER cleanup - this is the true starting point
    const { stdout: shaAfterCleanup } = await execAsync('git rev-parse HEAD', {
      cwd: worktreePath,
      shell: '/bin/bash',
    });
    initialSha = shaAfterCleanup.trim();

    // Install dependencies
    await installDependencies(worktreePath);

    if (setupOnly) {
      // Setup-only mode: just show the commands
      const result = await setupAgentExecution(
        test, agent, worktreePath, timestamp, evaluationsDir,
      );
      console.log('\n  ✓ Test environment ready!');
      console.log('\n  To run the test manually:');
      console.log(`    cd "${worktreePath}"`);
      console.log(`    ${result.command}`);
      console.log('\n  Output will be saved to:');
      console.log(`    ${result.outputDir}`);
      console.log('\n  To capture output:');
      console.log(`    cd "${worktreePath}"`);
      console.log(`    ${result.command} > "${result.outputDir}/stdout.txt" 2> "${result.outputDir}/stderr.txt"`);
      console.log('\n  To cleanup when done:');
      console.log(`    git worktree remove --force "${worktreePath}"`);
      console.log(`    git branch -D ${branchName}`);
      console.log('');
      console.log('  Note: Use --force since worktree will have modified files');

      return {
        ...result,
        setupOnly: true,
        branchName,
        worktreePath,
      };
    }
    // Execute agent
    const result = await executeAgent(
      test, agent, worktreePath, timestamp, initialSha, evaluationsDir,
    );

    console.log(`  Result: ${result.success ? 'SUCCESS' : 'PENDING'}`);
    console.log(`  Output: ${result.outputDir}`);

    return result;
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Cleanup (skip if setup-only mode)
    if (worktreePath && branchName && !setupOnly) {
      await cleanupWorktree(worktreePath, branchName);
    }
  }
}
