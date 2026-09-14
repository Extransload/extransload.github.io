const root = document.querySelector<HTMLElement>('[data-splash]');

if (root) {
  const chapters = [...root.querySelectorAll<HTMLElement>('[data-chapter]')];
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-chapter-link]')];
  const videos = [...root.querySelectorAll<HTMLVideoElement>('[data-chapter-video]')];
  let activeId = '';
  let frame = 0;
  let lastScrollY = window.scrollY;

  root.dataset.motion = 'on';
  root.dataset.scrollDirection = 'up';
  root.dataset.coverReady = 'false';

  const syncVideo = (video: HTMLVideoElement) => {
    const section = video.closest<HTMLElement>('[data-chapter]');
    const link = video.closest('a');
    const shouldPlay = root.dataset.motion === 'on' && !document.hidden && section?.dataset.inView === 'true';
    const isHovered = link?.matches(':hover, :focus-within') ?? false;
    video.playbackRate = isHovered ? 1.12 : 1;
    if (!shouldPlay) { video.pause(); return; }
    const source = video.querySelector('source');
    if (source?.dataset.src) {
      source.src = source.dataset.src;
      delete source.dataset.src;
      video.load();
    }
    // Keep the poster visible if autoplay is unavailable.
    if (video.paused) void video.play().catch(() => {});
  };

  const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
  const cover = root.querySelector<HTMLElement>('.book-splash__face');
  // The cover is the first document section. Reading offsetTop here is unsafe
  // because a sticky element reports its restored scroll position after reload.
  const coverStart = 0;
  const coverElement = (selector: string) => root.querySelector<HTMLElement>(selector);
  const chapterLocks = new Map<HTMLElement, number>();
  const chapterVisuals = (chapter: HTMLElement) => [...chapter.querySelectorAll<HTMLElement>('.splash-chapter__copy, .splash-chapter__media')];
  const chapterContentIsAboveViewport = (chapter: HTMLElement) => chapterVisuals(chapter)
    .every((element) => element.getBoundingClientRect().bottom <= 0);
  const chapterContentIsBelowViewport = (chapter: HTMLElement) => chapterVisuals(chapter)
    .every((element) => element.getBoundingClientRect().top >= window.innerHeight);
  const lockChapterVisual = (chapter: HTMLElement) => {
    const link = chapter.querySelector<HTMLElement>('.splash-chapter__link');
    if (!link) return;
    link.style.removeProperty('--chapter-lock-offset');
    const naturalTop = link.getBoundingClientRect().top;
    if (!chapterLocks.has(chapter)) chapterLocks.set(chapter, naturalTop);
    const lockedTop = chapterLocks.get(chapter)!;
    link.style.setProperty('--chapter-lock-offset', `${(lockedTop - naturalTop).toFixed(2)}px`);
    chapter.dataset.chapterLocked = 'true';
  };
  const unlockChapterVisual = (chapter: HTMLElement) => {
    if (chapter.dataset.chapterLocked !== 'true') return;
    chapterLocks.delete(chapter);
    chapter.dataset.chapterLocked = 'false';
    chapter.querySelector<HTMLElement>('.splash-chapter__link')?.style.removeProperty('--chapter-lock-offset');
  };
  const setCoverElementProgress = (element: HTMLElement | null, progress: number, exitOffset: number, exitScale = 1) => {
    if (!element) return;
    element.style.setProperty('--cover-opacity', progress.toFixed(3));
    element.style.setProperty('--cover-offset', `${((1 - progress) * exitOffset).toFixed(2)}rem`);
    element.style.setProperty('--cover-scale', (1 - (1 - progress) * (1 - exitScale)).toFixed(3));
  };
  const coverStage = (progress: number, start: number, end: number) => easeOutCubic(clamp((progress - start) / (end - start)));
  const setCoverProgress = (showFullCover = false) => {
    if (!cover) return;
    // Let the cover settle into the first chapter gradually; short touch drags
    // should not make the crest and title disappear immediately.
    const travel = Math.max(window.innerHeight * 0.82, 1);
    const progress = showFullCover ? 1 : clamp(1 - Math.max(0, window.scrollY - coverStart) / travel);
    // Keep the chapter fully covered until the cover's scroll distance is complete.
    cover.style.setProperty('--cover-veil-opacity', progress > 0 ? '1' : '0');
    setCoverElementProgress(coverElement('.book-splash__crest'), coverStage(progress, 0.48, 1), -2.5, 0.88);
    setCoverElementProgress(coverElement('.book-splash__center'), coverStage(progress, 0.34, 0.9), -1.25, 0.94);
    setCoverElementProgress(coverElement('.book-splash__tagline'), coverStage(progress, 0.28, 0.72), 1.5);
    setCoverElementProgress(coverElement('.book-splash__scroll'), coverStage(progress, 0.2, 0.52), 2.5, 0.86);
    setCoverElementProgress(coverElement('.book-splash__admin'), coverStage(progress, 0.4, 0.9), 1, 0.96);
  };
  const update = () => {
    frame = 0;
    const scrollY = window.scrollY;
    if (scrollY <= 4 || scrollY < lastScrollY - 1) root.dataset.scrollDirection = 'up';
    else if (scrollY > lastScrollY + 1) root.dataset.scrollDirection = 'down';
    lastScrollY = scrollY;
    for (const chapter of chapters) {
      const box = chapter.getBoundingClientRect();
      const chapterCenter = box.top + box.height / 2;
      const progress = clamp(1 - Math.abs(chapterCenter - window.innerHeight / 2) / window.innerHeight);
      chapter.style.setProperty('--glow-progress', progress.toFixed(3));
      const impact = clamp((progress - 0.42) / 0.58) ** 1.35;
      chapter.style.setProperty('--glow-impact', impact.toFixed(3));
    }
    const readingLine = window.innerHeight * 0.5;
    const current = chapters.find((chapter) => {
      const box = chapter.getBoundingClientRect();
      return box.top <= readingLine && box.bottom > readingLine;
    });
    const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const currentIndex = atEnd ? chapters.length - 1 : (current ? chapters.indexOf(current) : -1);
    setCoverProgress(root.dataset.scrollDirection === 'up' && currentIndex < 0);
    let visibleIndex = currentIndex;
    if (currentIndex >= 0 && root.dataset.scrollDirection === 'down' && currentIndex > 0) {
      if (!chapterContentIsAboveViewport(chapters[currentIndex - 1])) visibleIndex = currentIndex - 1;
    } else if (currentIndex >= 0 && root.dataset.scrollDirection === 'up' && currentIndex < chapters.length - 1) {
      if (!chapterContentIsBelowViewport(chapters[currentIndex + 1])) visibleIndex = currentIndex + 1;
    }
    const lockIndex = currentIndex < 0
      ? -1
      : visibleIndex !== currentIndex
        ? currentIndex
        : root.dataset.scrollDirection === 'down'
          ? currentIndex + 1
          : Math.max(currentIndex - 1, 0);
    for (const [index, chapter] of chapters.entries()) {
      chapter.dataset.chapterVisible = String(index === visibleIndex);
      if (index === lockIndex && index !== visibleIndex) lockChapterVisual(chapter);
      else unlockChapterVisual(chapter);
    }
    const nextId = (currentIndex >= 0 ? chapters[currentIndex]?.id : undefined) ?? '';
    if (nextId === activeId) return;
    activeId = nextId;
    for (const link of links) {
      if (link.dataset.chapterLink === activeId) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    for (const chapter of chapters) chapter.dataset.active = String(chapter.id === activeId);
    videos.forEach(syncVideo);
  };
  const scheduleUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  // Enhance only after the initial HTML is visible; links and artwork also work without JS.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const chapter = entry.target as HTMLElement;
      chapter.dataset.inView = String(entry.isIntersecting);
      if (entry.isIntersecting) chapter.dataset.revealed = 'true';
      chapter.querySelectorAll<HTMLVideoElement>('video').forEach(syncVideo);
    }
  }, { threshold: 0 });
  for (const chapter of chapters) {
    if (chapter.getBoundingClientRect().top < window.innerHeight) chapter.dataset.revealed = 'true';
    observer.observe(chapter);
  }
  root.dataset.enhanced = 'true';

  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      history.pushState(null, '', link.hash);
      if (target.id === 'cover') window.scrollTo({ top: 0, behavior: 'smooth' });
      else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Anchor navigation should carry keyboard focus into the chosen section.
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
  });
  for (const video of videos) {
    const link = video.closest('a');
    for (const event of ['pointerenter', 'pointerleave', 'focusin', 'focusout']) {
      link?.addEventListener(event, () => requestAnimationFrame(() => syncVideo(video)));
    }
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  const resyncAfterScrollRestoration = () => {
    scheduleUpdate();
    window.requestAnimationFrame(scheduleUpdate);
    window.setTimeout(scheduleUpdate, 120);
  };
  window.addEventListener('pageshow', resyncAfterScrollRestoration);
  window.addEventListener('load', resyncAfterScrollRestoration);
  window.setTimeout(() => { root.dataset.coverReady = 'true'; }, 240);
  document.addEventListener('visibilitychange', () => videos.forEach(syncVideo));
  videos.forEach(syncVideo);
  update();
}
