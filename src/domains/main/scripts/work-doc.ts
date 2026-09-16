// 상세 폴리오: 좌측 목차가 현재 읽는 장을 따라간다. 장식 애니메이션은 두지 않는다.

export const initWorkDoc = () => {
  const root = document.querySelector<HTMLElement>('[data-work-doc]');
  if (!root) return;

  const links = new Map<string, HTMLAnchorElement>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-rail-link]')) {
    const key = link.dataset.railLink;
    if (key) links.set(key, link);
  }
  if (!links.size) return;

  const headings = [...root.querySelectorAll<HTMLElement>('section[data-chapter] > h2')];
  if (!headings.length) return;

  const mark = (id: string) => {
    for (const [key, link] of links) {
      if (key === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  const pick = () => {
    const line = window.innerHeight * 0.3;
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= line) current = heading;
      else break;
    }
    mark(current.id);
  };

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      pick();
    });
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  pick();
  root.dataset.workDocReady = 'true';
};
