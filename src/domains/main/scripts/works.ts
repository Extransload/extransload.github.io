const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const READING_LINE = 0.42;

export const initWorksScroll = () => {
  const root = document.querySelector<HTMLElement>('[data-works-scroll]');
  if (!root) return;

  const entries = [...root.querySelectorAll<HTMLElement>('[data-works-entry]')];
  const revealables = [...root.querySelectorAll<HTMLElement>('[data-works-entry], [data-works-card]')];
  const cover = root.querySelector<HTMLElement>('[data-works-cover]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

  const revealAll = () => revealables.forEach((element) => { element.dataset.revealed = 'true'; });

  const update = () => {
    frame = 0;
    const readingLine = window.innerHeight * READING_LINE;

    const coverProgress = clamp(1 - window.scrollY / Math.max(window.innerHeight * 0.82, 1));
    root.style.setProperty('--works-cover-progress', coverProgress.toFixed(3));
    root.style.setProperty('--works-cover-offset', `${((1 - coverProgress) * -2.5).toFixed(2)}rem`);
    root.style.setProperty('--works-cover-scale', (0.94 + coverProgress * 0.06).toFixed(3));
    root.style.setProperty('--works-cover-opacity', (0.42 + coverProgress * 0.58).toFixed(3));

    const activeEntry = entries.find((entry) => {
      const box = entry.getBoundingClientRect();
      return box.top <= readingLine && box.bottom > readingLine;
    });
    for (const entry of entries) entry.dataset.active = String(entry === activeEntry);

    if (activeEntry) {
      root.dataset.worksChapter = activeEntry.dataset.worksEntry || 'chapter';
      return;
    }

    const passedCover = Boolean(cover && window.scrollY > cover.offsetTop + cover.offsetHeight);
    root.dataset.worksChapter = passedCover ? 'body' : 'cover';
  };

  const scheduleUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  const enable = () => {
    const reduced = reducedMotion.matches;
    root.dataset.worksMotion = reduced ? 'reduced' : 'full';
    if (reduced) {
      revealAll();
      update();
      return;
    }

    const observer = new IntersectionObserver((observed) => {
      for (const item of observed) {
        if (item.isIntersecting) (item.target as HTMLElement).dataset.revealed = 'true';
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    for (const element of revealables) {
      if (element.getBoundingClientRect().top < window.innerHeight) element.dataset.revealed = 'true';
      observer.observe(element);
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    update();
  };

  root.dataset.worksEnhanced = 'true';
  reducedMotion.addEventListener('change', () => window.location.reload());
  enable();
};
