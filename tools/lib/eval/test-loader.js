import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { sanitizeTestName } from '../utils/sanitize.js';

/**
 * Load task definition from task.yaml
 */
export function loadTestDefinition(outputDir, projectRoot) {
  // New structure: evaluations/{timestamp}/{task-name}/{agent}/
  const parts = outputDir.split('/').filter((p) => p);
  const evaluationsIndex = parts.indexOf('evaluations');

  if (evaluationsIndex === -1) {
    throw new Error('Output directory must be under evaluations/');
  }

  // Extract task name from path
  const taskNameIndex = evaluationsIndex + 2;
  if (taskNameIndex >= parts.length) {
    throw new Error('Invalid output directory structure');
  }

  const taskDirName = parts[taskNameIndex];

  // Search for task.yaml file with matching sanitized name
  const taskYamlPath = findTaskYamlByName(taskDirName, projectRoot);

  if (!taskYamlPath) {
    throw new Error(`Task definition not found for: ${taskDirName}`);
  }

  const content = readFileSync(taskYamlPath, 'utf8');
  return parseYaml(content);
}

/**
 * Find task.yaml file by searching for task with matching sanitized name
 */
function findTaskYamlByName(taskDirName, projectRoot) {
  const tasksDir = join(projectRoot, 'tasks');

  // Recursively search for all task.yaml files
  function findTaskYamls(dir) {
    const results = [];
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        results.push(...findTaskYamls(fullPath));
      } else if (entry === 'task.yaml') {
        results.push(fullPath);
      }
    }

    return results;
  }

  // Find all task.yaml files
  const allTaskYamls = findTaskYamls(tasksDir);

  // Check each one to see if the sanitized name matches
  for (const yamlPath of allTaskYamls) {
    try {
      const content = readFileSync(yamlPath, 'utf8');
      const task = parseYaml(content);
      const sanitized = sanitizeTestName(task.name);

      if (sanitized === taskDirName) {
        return yamlPath;
      }
    } catch (e) {
      // Skip invalid yaml files
    }
  }

  return null;
}
