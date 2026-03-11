import path from 'path';
import { ensureDir } from './fs-utils.js';
import { cloneRepository } from './git-utils.js';

/**
 * Deduplicates clones by cloneUrl + ref.
 * Concurrent calls for the same key await the first caller's clone.
 */
export class CloneRegistry {
  constructor() {
    this.entries = new Map();
  }

  /**
   * Get or create a clone for the given repo + ref combination.
   * Returns the path to the cloned repo directory.
   */
  async getOrCreate(cloneUrl, ref, isCommitHash, baseDir) {
    const key = `${cloneUrl}#${ref}`;

    if (this.entries.has(key)) {
      return this.entries.get(key).promise;
    }

    const repoName = cloneUrl.replace(/.*\//, '').replace('.git', '');
    const safeBranch = ref.replace(/[^a-zA-Z0-9-]/g, '-');
    const cloneDir = path.join(baseDir, `${repoName}-${safeBranch}`);

    const promise = this._clone(cloneUrl, cloneDir, ref, isCommitHash);
    this.entries.set(key, { path: cloneDir, promise });

    return promise;
  }

  async _clone(cloneUrl, cloneDir, ref, isCommitHash) {
    await ensureDir(path.dirname(cloneDir));
    cloneRepository(cloneUrl, cloneDir, { branch: ref, isCommitHash });
    return cloneDir;
  }
}
