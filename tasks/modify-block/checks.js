import { checkLint } from '../../scripts/utils/check-helpers.js';

const ws = process.argv[2];
if (!ws) {
  console.error('Usage: node checks.js <workspace-path>');
  process.exit(1);
}

const results = await Promise.all([
  checkLint(ws),
]);

console.log(JSON.stringify(results));
