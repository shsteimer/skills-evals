#!/usr/bin/env node

import { execAsync } from './utils/process-utils.js';

const REPO = 'skills-evals-bot/aem-boilerplate-evals';

// Matches branch names created by run-tasks: {agent}-{MMDDHHMM}-{counter}
// e.g. claude-03151109-1, codex-03111407-12
const TASK_BRANCH_RE = /^.+-\d{8}-\d+$/;

export function isTaskRunBranch(name) {
  return TASK_BRANCH_RE.test(name);
}

export async function getOpenPRs(repo) {
  const { stdout } = await execAsync(
    `gh pr list --repo ${repo} --state open --json number,title,headRefName --limit 200`,
  );
  return JSON.parse(stdout);
}

export async function getTaskRunBranches(repo) {
  const allBranches = [];
  let page = 1;

  while (true) {
    const { stdout } = await execAsync(
      `gh api repos/${repo}/branches?per_page=100\\&page=${page} --jq '.[].name'`,
    );

    const names = stdout.trim().split('\n').filter(Boolean);
    allBranches.push(...names);

    if (names.length < 100) break;
    page++;
  }

  return allBranches.filter(isTaskRunBranch);
}

export async function closePR(repo, number) {
  await execAsync(`gh pr close ${number} --repo ${repo}`);
}

export async function deleteBranch(repo, branchName) {
  await execAsync(
    `gh api -X DELETE repos/${repo}/git/refs/heads/${branchName}`,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('[dry-run] No changes will be made.\n');
  }

  // Close open PRs from task runs
  const allPRs = await getOpenPRs(REPO);
  const prs = allPRs.filter((pr) => isTaskRunBranch(pr.headRefName));
  const skippedPRs = allPRs.length - prs.length;
  if (prs.length === 0) {
    console.log('No task-run PRs found.');
  } else {
    console.log(`Found ${prs.length} task-run PR(s):`);
    for (const pr of prs) {
      console.log(`  #${pr.number} - ${pr.title} (${pr.headRefName})`);
      if (!dryRun) {
        await closePR(REPO, pr.number);
        console.log(`    closed.`);
      }
    }
  }
  if (skippedPRs > 0) {
    console.log(`Skipped ${skippedPRs} PR(s) not matching task-run pattern.`);
  }

  console.log('');

  // Delete task-run branches
  const branches = await getTaskRunBranches(REPO);
  if (branches.length === 0) {
    console.log('No branches to delete.');
  } else {
    console.log(`Found ${branches.length} branch(es) to delete:`);
    for (const branch of branches) {
      console.log(`  ${branch}`);
      if (!dryRun) {
        try {
          await deleteBranch(REPO, branch);
          console.log(`    deleted.`);
        } catch (error) {
          console.error(`    failed: ${error.message}`);
        }
      }
    }
  }

  console.log('\nDone.');
}

// Run main when executed directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^\//, ''));
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
