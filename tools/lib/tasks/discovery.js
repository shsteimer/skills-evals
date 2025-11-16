import {
  readFileSync, readdirSync, statSync, existsSync,
} from 'fs';
import { join, dirname, relative } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * Find all task.yaml files recursively
 */
export function findAllTests(tasksDir) {
  const tests = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry === 'task.yaml') {
        tests.push(dirname(fullPath));
      }
    }
  }

  walk(tasksDir);
  return tests;
}

/**
 * Load and parse a task.yaml file
 */
export function loadTest(testDir, rootDir) {
  const testYamlPath = join(testDir, 'task.yaml');

  if (!existsSync(testYamlPath)) {
    throw new Error(`task.yaml not found in ${testDir}`);
  }

  const content = readFileSync(testYamlPath, 'utf8');
  const test = parseYaml(content);

  // Add metadata
  test._path = testDir;
  test._relativePath = relative(rootDir, testDir);

  return test;
}

/**
 * Filter tests based on options
 */
export function filterTests(tests, options) {
  let filtered = tests;

  // Filter by test name/path
  if (options.test) {
    const testPattern = options.test;
    filtered = filtered.filter((test) => (
      // Support exact match or path contains
      test._path.includes(testPattern) || test._relativePath.includes(testPattern)
    ));
  }

  // Filter by tags
  if (options.tags.length > 0) {
    filtered = filtered.filter((test) => {
      if (!test.tags || test.tags.length === 0) return false;
      // Test must have at least one of the specified tags
      return options.tags.some((tag) => test.tags.includes(tag));
    });
  }

  // Filter by skills
  if (options.skills.length > 0) {
    filtered = filtered.filter((test) => {
      if (!test.skills || test.skills.length === 0) return false;
      // Test must have at least one of the specified skills
      return options.skills.some((skill) => test.skills.includes(skill));
    });
  }

  return filtered;
}
