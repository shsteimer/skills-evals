import {
  existsSync, unlinkSync, readdirSync, statSync,
} from 'fs';
import { join } from 'path';

/**
 * Remove evaluation artifacts from a directory
 */
export function cleanEvaluationArtifacts(dir) {
  const artifacts = [
    'evaluation-report.md',
    'evaluation-results.json',
    'eval-task.txt',
    'evaluation-prompt.txt',
    'eval-agent-output.txt',
    'eval-agent-response.json',
  ];

  let cleaned = 0;

  for (const artifact of artifacts) {
    const filePath = join(dir, artifact);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Clean evaluation artifacts based on path type
 */
export function cleanDirectory(path) {
  let totalCleaned = 0;

  // If this is an agent directory, clean it directly
  if (existsSync(join(path, 'test-info.json'))) {
    const cleaned = cleanEvaluationArtifacts(path);
    if (cleaned > 0) {
      console.log(`  Cleaned ${cleaned} artifact(s) from ${path}`);
    }
    return cleaned;
  }

  // Otherwise, recursively clean subdirectories
  const entries = readdirSync(path);
  for (const entry of entries) {
    const entryPath = join(path, entry);
    if (statSync(entryPath).isDirectory()) {
      totalCleaned += cleanDirectory(entryPath);
    }
  }

  return totalCleaned;
}
