import { execSync } from 'child_process';

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


