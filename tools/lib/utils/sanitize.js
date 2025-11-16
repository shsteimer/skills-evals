/**
 * Sanitize test name for use as directory/branch name
 * Used by both run-tasks and evaluate scripts
 */
export function sanitizeTestName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50); // Keep it reasonable length
}
