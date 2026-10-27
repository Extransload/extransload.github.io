export const initWorksScroll = () => {
  const root = document.querySelector<HTMLElement>('[data-works-scroll]');
  if (!root) return;

  const revealables = [...root.querySelectorAll<HTMLElement>('[data-works-card]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const enable = () => {
    const reduced = reducedMotion.matches;
    root.dataset.worksMotion = reduced ? 'reduced' : 'full';
    if (reduced) {
      revealables.forEach((element) => {
        element.dataset.revealed = 'true';
      });
      return;
    }

    const observer = new IntersectionObserver(
      (observed) => {
        for (const item of observed) {
          if (item.isIntersecting) (item.target as HTMLElement).dataset.revealed = 'true';
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    for (const element of revealables) {
      if (element.getBoundingClientRect().top < window.innerHeight) element.dataset.revealed = 'true';
      observer.observe(element);
    }
  };

  root.dataset.worksEnhanced = 'true';
  reducedMotion.addEventListener('change', () => window.location.reload());
  enable();
};
