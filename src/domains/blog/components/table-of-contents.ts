const cleanups = new WeakMap<object, () => void>();

export function initializeTableOfContents(scope: ParentNode = document) {
  const key = scope as object;
  cleanups.get(key)?.();

  const links = [...scope.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  const headingIds = [...new Set(links.map((link) => decodeURIComponent(link.hash.slice(1))))];
  const headings = headingIds
    .map((id) => document.getElementById(id))
    .filter((heading): heading is HTMLElement => Boolean(heading));
  if (links.length === 0 || headings.length === 0) return;

  const aside = scope.querySelector<HTMLElement>('.article__desktop-toc');
  let hasObservedScroll = false;
  const setActiveLink = (id: string, syncHash: boolean) => {
    const currentIndex = headings.findIndex((heading) => heading.id === id);
    const activeIds = new Set([id]);
    if (currentIndex >= 0 && headings[currentIndex].tagName === 'H3') {
      const parent = [...headings.slice(0, currentIndex)].reverse().find((heading) => heading.tagName === 'H2');
      if (parent) activeIds.add(parent.id);
    }
    links.forEach((link) => {
      if (activeIds.has(decodeURIComponent(link.hash.slice(1)))) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    aside?.querySelectorAll<HTMLElement>('[data-toc-preview]').forEach((preview) => {
      preview.toggleAttribute('data-active', activeIds.has(preview.dataset.tocPreview ?? ''));
    });
    if (syncHash && decodeURIComponent(window.location.hash.slice(1)) !== id) {
      window.history.replaceState(window.history.state, '', `#${encodeURIComponent(id)}`);
    }
  };
  const updateActiveHeading = (syncHash = hasObservedScroll) => {
    const current = headings.reduce<HTMLElement>(
      (active, heading) => (heading.getBoundingClientRect().top <= 48 ? heading : active),
      headings[0],
    );
    setActiveLink(current.id, syncHash);
  };
  const onScroll = () => {
    hasObservedScroll = true;
    updateActiveHeading(true);
  };
  const onResize = () => updateActiveHeading();
  const onLinkClick = (event: Event) => {
    const link = event.currentTarget as HTMLAnchorElement;
    const id = decodeURIComponent(link.hash.slice(1));
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'auto', block: 'start' });
    window.history.replaceState(window.history.state, '', `#${encodeURIComponent(id)}`);
    link.closest('details')?.removeAttribute('open');
    const shell =
      scope instanceof HTMLElement && scope.matches('.article-shell')
        ? scope
        : scope.querySelector<HTMLElement>('.article-shell');
    shell?.removeAttribute('data-toc-top-open');
    scope.querySelector<HTMLButtonElement>('[data-toc-top-toggle]')?.setAttribute('aria-expanded', 'false');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  updateActiveHeading(false);
  links.forEach((link) => link.addEventListener('click', onLinkClick));

  const tocSurfaces = [...scope.querySelectorAll<HTMLElement>('.table-of-contents__desktop')];
  const timers = new Map<HTMLElement, number>();
  const onTocScroll = (event: Event) => {
    const toc = event.currentTarget as HTMLElement;
    toc.toggleAttribute('data-toc-scrolling', true);
    window.clearTimeout(timers.get(toc));
    timers.set(
      toc,
      window.setTimeout(() => toc.removeAttribute('data-toc-scrolling'), 800),
    );
  };
  tocSurfaces.forEach((toc) => toc.addEventListener('scroll', onTocScroll, { passive: true }));
  cleanups.set(key, () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    links.forEach((link) => link.removeEventListener('click', onLinkClick));
    tocSurfaces.forEach((toc) => {
      toc.removeEventListener('scroll', onTocScroll);
      window.clearTimeout(timers.get(toc));
    });
  });
}
