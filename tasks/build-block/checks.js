import path from 'path';
import { exists, listDirs, checkLint, check } from '../../scripts/utils/check-helpers.js';

const ws = process.argv[2];
if (!ws) {
  console.error('Usage: node checks.js <workspace-path>');
  process.exit(1);
}

const boilerplateBlocks = ['cards', 'columns', 'footer', 'fragment', 'header', 'hero'];
const blocksDir = path.join(ws, 'blocks');

const agentBlocks = await listDirs(blocksDir, (d) => !boilerplateBlocks.includes(d));
const blockWithFiles = await findBlockWithFiles(agentBlocks);

const results = await Promise.all([
  checkBlockFilesExist(),
  checkLint(ws),
]);

console.log(JSON.stringify(results));

async function findBlockWithFiles(blocks) {
  for (const name of blocks) {
    const dir = path.join(blocksDir, name);
    const [hasJs, hasCss] = await Promise.all([
      exists(path.join(dir, `${name}.js`)),
      exists(path.join(dir, `${name}.css`)),
    ]);
    if (hasJs && hasCss) return name;
  }
  return null;
}

async function checkBlockFilesExist() {
  if (blockWithFiles) {
    return check(
      'block-files-exist',
      'Block folder with matching .js and .css files exists in blocks/',
      true,
      `Found blocks/${blockWithFiles}/${blockWithFiles}.js and .css`,
    );
  }
  return check(
    'block-files-exist',
    'Block folder with matching .js and .css files exists in blocks/',
    false,
    `No new block folder found with matching JS/CSS. Agent blocks: [${agentBlocks.join(', ')}]`,
  );
}

