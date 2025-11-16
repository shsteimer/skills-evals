/**
 * Extract skills used from transcript/output
 */
export function extractSkillsFromText(text) {
  const skills = new Set();
  const skillPatterns = [
    /Using [Ss]kill:\s*([a-z-]+)/g,
    /Invoking skill:\s*([a-z-]+)/g,
    /\[Skill:\s*([a-z-]+)\]/g,
  ];

  for (const pattern of skillPatterns) {
    let match = pattern.exec(text);
    while (match !== null) {
      skills.add(match[1]);
      match = pattern.exec(text);
    }
  }

  return Array.from(skills);
}

/**
 * Extract PR link from transcript/output
 */
export function extractPRLink(text) {
  // Look for GitHub PR URLs
  const prPattern = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
  const match = text.match(prPattern);
  return match ? match[0] : null;
}
