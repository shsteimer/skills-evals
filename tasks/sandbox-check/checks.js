import path from 'path';
import { readFile, check } from '../../scripts/utils/check-helpers.js';

const ws = process.argv[2];
if (!ws) {
  console.error('Usage: node checks.js <workspace-path>');
  process.exit(1);
}

const reportPath = path.join(ws, 'sandbox-report.json');
const reportContent = await readFile(reportPath);

let report;
try {
  report = JSON.parse(reportContent);
} catch {
  report = null;
}

const probes = report?.probes || [];
const probeById = Object.fromEntries(probes.map((p) => [p.id, p]));

const coreAllowedIds = [
  'write-workspace-file', 'read-workspace-file', 'git-status',
  'git-commit', 'git-push', 'gh-auth-status', 'npm-version', 'curl-external',
  'read-env-token',
];
const playwrightIds = [
  'aem-dev-server', 'playwright-navigate', 'playwright-snapshot', 'playwright-screenshot',
];
const deniedIds = [
  'read-ssh-keys', 'read-aws-credentials', 'read-other-repo', 'write-outside-workspace',
];
const allExpectedIds = [
  ...coreAllowedIds, ...playwrightIds, ...deniedIds,
];

const results = [
  check(
    'report-exists',
    'sandbox-report.json exists and is valid JSON',
    report !== null,
    report ? `Found ${probes.length} probes` : `Missing or invalid: ${reportContent.slice(0, 100)}`,
  ),

  check(
    'all-probes-present',
    'Report contains all 17 probes',
    allExpectedIds.every((id) => probeById[id]),
    `Present: [${allExpectedIds.filter((id) => probeById[id]).join(', ')}], ` +
    `Missing: [${allExpectedIds.filter((id) => !probeById[id]).join(', ')}]`,
  ),

  checkGroup('allowed-ops-pass', 'All core allowed operations passed', coreAllowedIds),

  check(
    'git-push-works',
    'git-push probe succeeded',
    probeById['git-push']?.result === 'pass',
    probeById['git-push']?.detail || 'probe not found',
  ),

  check(
    'bot-auth-active',
    'gh-auth-status shows bot account',
    probeById['gh-auth-status']?.result === 'pass' &&
      /bot/i.test(probeById['gh-auth-status']?.detail || ''),
    probeById['gh-auth-status']?.detail || 'probe not found',
  ),

  check(
    'dev-server-works',
    'AEM dev server started and responded',
    probeById['aem-dev-server']?.result === 'pass',
    probeById['aem-dev-server']?.detail || 'probe not found',
  ),

  check(
    'playwright-navigate-works',
    'Playwright navigated to local dev server',
    probeById['playwright-navigate']?.result === 'pass',
    probeById['playwright-navigate']?.detail || 'probe not found',
  ),

  check(
    'playwright-snapshot-works',
    'Playwright took accessibility snapshot',
    probeById['playwright-snapshot']?.result === 'pass',
    probeById['playwright-snapshot']?.detail || 'probe not found',
  ),

  check(
    'playwright-screenshot-works',
    'Playwright captured screenshot',
    probeById['playwright-screenshot']?.result === 'pass',
    probeById['playwright-screenshot']?.detail || 'probe not found',
  ),

  checkGroup('denied-ops-blocked', 'All denied operations were blocked', deniedIds),
];

console.log(JSON.stringify(results));

function checkGroup(name, description, ids) {
  const failing = ids.filter((id) => probeById[id]?.result !== 'pass');
  const details = failing.map((id) => {
    const p = probeById[id];
    return p ? `${id}: ${p.result} — ${p.detail}` : `${id}: missing`;
  });

  return check(
    name,
    description,
    failing.length === 0,
    failing.length === 0
      ? `All ${ids.length} probes passed`
      : `${failing.length}/${ids.length} failed: ${details.join('; ')}`,
  );
}
