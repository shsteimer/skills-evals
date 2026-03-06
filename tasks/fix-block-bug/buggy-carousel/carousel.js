/**
 * Carousel block — displays slides with navigation.
 * Each row in the block table becomes a slide.
 */

function buildNav(block, slides) {
  const nav = document.createElement('div');
  nav.classList.add('carousel-nav');

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.classList.add('carousel-dot');
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goToSlide(block, i));
    nav.append(dot);
  });

  block.append(nav);
}

function buildControls(block) {
  const prev = document.createElement('button');
  prev.classList.add('carousel-prev');
  prev.setAttribute('aria-label', 'Previous slide');
  prev.innerHTML = '&#10094;';
  prev.addEventListener('click', () => navigate(block, -1));

  const next = document.createElement('button');
  next.classList.add('carousel-next');
  next.setAttribute('aria-label', 'Next slide');
  next.innerHTML = '&#10095;';
  next.addEventListener('click', () => navigate(block, 1));

  block.append(prev, next);
}

function goToSlide(block, index) {
  const track = block.querySelector('.carousel-track');
  const slides = track.querySelectorAll('.carousel-slide');
  const dots = block.querySelectorAll('.carousel-dot');

  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;

  track.style.transform = `translateX(-${index * 100}%)`;
  block.dataset.currentSlide = index;

  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });
}

function navigate(block, direction) {
  const current = parseInt(block.dataset.currentSlide || '0', 10);
  goToSlide(block, current + direction);
}

export default function decorate(block) {
  const rows = [...block.children];
  block.textContent = '';
  block.dataset.currentSlide = 0;

  const track = document.createElement('div');
  track.classList.add('carousel-track');

  rows.forEach((row) => {
    const slide = document.createElement('div');
    slide.classList.add('carousel-slide');

    const cells = [...row.children];
    const imageCell = cells[0];
    const contentCell = cells[1];

    // Image
    if (imageCell) {
      const pic = imageCell.querySelector('picture');
      if (pic) {
        const imgWrapper = document.createElement('div');
        imgWrapper.classList.add('carousel-image');
        imgWrapper.append(pic);
        slide.append(imgWrapper);
      }
    }

    // Content — renders authored HTML into the slide
    if (contentCell) {
      const content = document.createElement('div');
      content.classList.add('carousel-content');
      content.innerHTML = contentCell.innerHTML;
      slide.append(content);
    }

    track.append(slide);
  });

  block.append(track);
  buildNav(block, rows);
  buildControls(block);

  // Auto-play
  setInterval(() => navigate(block, 1), 5000);
}
