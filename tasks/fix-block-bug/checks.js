import path from 'path';
import { exists, checkLint, check } from '../../scripts/utils/check-helpers.js';

const ws = process.argv[2];
if (!ws) {
  console.error('Usage: node checks.js <workspace-path>');
  process.exit(1);
}

const carouselDir = path.join(ws, 'blocks', 'carousel');

const results = await Promise.all([
  checkCarouselFilesExist(),
  checkLint(ws),
]);

console.log(JSON.stringify(results));

async function checkCarouselFilesExist() {
  const [hasJs, hasCss] = await Promise.all([
    exists(path.join(carouselDir, 'carousel.js')),
    exists(path.join(carouselDir, 'carousel.css')),
  ]);
  const both = hasJs && hasCss;
  return check(
    'carousel-files-exist',
    'Carousel block JS and CSS files still exist',
    both,
    both
      ? 'Both carousel.js and carousel.css present'
      : `Missing: ${!hasCss ? 'carousel.css ' : ''}${!hasJs ? 'carousel.js' : ''}`,
  );
}
