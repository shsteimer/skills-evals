import { execSync } from 'child_process';
import { execAsync } from './process-utils.js';

export function cloneRepository(cloneUrl, targetDir, options = {}) {
  const { branch, isCommitHash = false } = options;
  
  if (isCommitHash) {
    // For commit hashes, clone without depth and checkout the specific commit
    execSync(`git clone ${cloneUrl} "${targetDir}"`, {
      stdio: 'pipe'
    });
    execSync(`git checkout ${branch}`, {
      cwd: targetDir,
      stdio: 'pipe'
    });
  } else if (branch) {
    // For branches, use --depth 1 for faster cloning
    execSync(`git clone --depth 1 --branch ${branch} ${cloneUrl} "${targetDir}"`, {
      stdio: 'pipe'
    });
  } else {
    // Default clone
    execSync(`git clone ${cloneUrl} "${targetDir}"`, {
      stdio: 'pipe'
    });
  }
}

export function checkoutBranch(cwd, branchName, create = false) {
  const createFlag = create ? '-b ' : '';
  execSync(`git checkout ${createFlag}${branchName}`, { cwd });
}

export function addAndCommit(cwd, message) {
  try {
    execSync('git add .', { cwd });
    execSync(`git commit -m "${message}"`, { cwd });
  } catch (error) {
    // If nothing to commit, that's okay
  }
}

export async function captureGitChanges(workspaceDir, sinceCommitMessage) {
  try {
    // Find the commit with the specified message
    const { stdout: baseCommit } = await execAsync(
      `git log --grep="${sinceCommitMessage}" --format=%H -n 1`,
      { cwd: workspaceDir }
    );
    
    let diff = '';
    
    if (baseCommit.trim()) {
      // Get diff from base commit to current state
      const { stdout: trackedDiff } = await execAsync(
        `git diff ${baseCommit.trim()} HEAD`,
        { cwd: workspaceDir }
      );
      diff += trackedDiff;
      
      // Also get uncommitted changes
      const { stdout: uncommittedDiff } = await execAsync(
        'git diff HEAD',
        { cwd: workspaceDir }
      );
      if (uncommittedDiff) {
        diff += '\n' + uncommittedDiff;
      }
    } else {
      // Fallback: just get all uncommitted changes
      const { stdout: uncommittedDiff } = await execAsync(
        'git diff HEAD',
        { cwd: workspaceDir }
      );
      diff = uncommittedDiff;
    }
    
    // Capture untracked files as diffs
    const { stdout: untrackedFiles } = await execAsync(
      'git ls-files --others --exclude-standard',
      { cwd: workspaceDir }
    );
    
    if (untrackedFiles.trim()) {
      const files = untrackedFiles.trim().split('\n');
      for (const file of files) {
        try {
          const { stdout: fileContent } = await execAsync(
            `git diff --no-index /dev/null "${file}"`,
            { cwd: workspaceDir }
          );
          diff += '\n' + fileContent;
        } catch (error) {
          // git diff exits with code 1 when there are differences, which is expected
          if (error.stdout) {
            diff += '\n' + error.stdout;
          }
        }
      }
    }
    
    return diff;
  } catch (error) {
    return `Error capturing diff: ${error.message}`;
  }
}

export async function captureGitCommits(workspaceDir, sinceCommitMessage) {
  try {
    // Find the commit with the specified message
    const { stdout: baseCommit } = await execAsync(
      `git log --grep="${sinceCommitMessage}" --format=%H -n 1`,
      { cwd: workspaceDir }
    );
    
    if (!baseCommit.trim()) {
      return [];
    }
    
    // Get commits after the base commit
    const { stdout: commits } = await execAsync(
      `git log ${baseCommit.trim()}..HEAD --format="%H|%an|%ae|%ai|%s"`,
      { cwd: workspaceDir }
    );
    
    return commits.trim().split('\n')
      .filter(line => line)
      .map(line => {
        const [hash, author, email, date, ...messageParts] = line.split('|');
        return {
          hash,
          author,
          email,
          date,
          message: messageParts.join('|')
        };
      });
  } catch (error) {
    return [];
  }
}


