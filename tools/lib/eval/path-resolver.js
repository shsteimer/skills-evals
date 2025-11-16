import { existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

/**
 * Detect path type based on structure
 * Returns: 'timestamp', 'task', or 'agent'
 */
export function detectPathType(outputDir) {
  const parts = outputDir.split('/').filter((p) => p);
  const evaluationsIndex = parts.indexOf('evaluations');

  if (evaluationsIndex === -1) {
    return 'unknown';
  }

  // Count parts after 'evaluations'
  const partsAfterEvaluations = parts.length - evaluationsIndex - 1;

  if (partsAfterEvaluations === 1) {
    // evaluations/{timestamp}
    return 'timestamp';
  } if (partsAfterEvaluations === 2) {
    // evaluations/{timestamp}/{task-name}
    return 'task';
  } if (partsAfterEvaluations === 3) {
    // evaluations/{timestamp}/{task-name}/{agent}
    return 'agent';
  }

  return 'unknown';
}

/**
 * Get all task directories in a timestamp directory
 */
export function getTaskDirectories(timestampDir) {
  if (!existsSync(timestampDir)) {
    return [];
  }

  const entries = readdirSync(timestampDir);
  const taskDirs = [];

  for (const entry of entries) {
    const fullPath = join(timestampDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      taskDirs.push(fullPath);
    }
  }

  return taskDirs;
}

/**
 * Get all agent directories in a task directory
 */
export function getAgentDirectoriesForTask(taskDir) {
  if (!existsSync(taskDir)) {
    return [];
  }

  const entries = readdirSync(taskDir);
  const agentDirs = [];

  for (const entry of entries) {
    const fullPath = join(taskDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      agentDirs.push(fullPath);
    }
  }

  return agentDirs;
}

/**
 * Auto-select an eval agent different from the agent(s) being tested
 */
export function autoSelectEvalAgent(outputDir) {
  const availableAgents = ['claude-code', 'cursor-cli', 'codex-cli'];
  const pathType = detectPathType(outputDir);

  let testedAgents = [];

  if (pathType === 'timestamp') {
    // Get all agents that were tested
    try {
      const agentDirs = getAgentDirectories(outputDir);
      testedAgents = agentDirs.map((dir) => basename(dir));
    } catch (e) {
      return 'claude-code';
    }
  } else {
    // Single agent directory
    const pathParts = outputDir.split('/');
    const agent = pathParts[pathParts.length - 1];
    testedAgents = [agent];
  }

  // Find an agent that wasn't tested
  const untested = availableAgents.filter((a) => !testedAgents.includes(a));

  if (untested.length > 0) {
    return untested[0];
  }

  // All agents were tested, use claude-code as default
  return 'claude-code';
}

/**
 * Get all agent directories in a timestamp directory
 */
function getAgentDirectories(timestampDir) {
  try {
    const entries = readdirSync(timestampDir);
    return entries.filter((entry) => {
      const fullPath = join(timestampDir, entry);
      const stat = statSync(fullPath);
      return stat.isDirectory();
    }).map((dir) => join(timestampDir, dir));
  } catch (error) {
    throw new Error(`Failed to read agent directories: ${error.message}`);
  }
}
