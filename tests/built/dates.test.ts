import { describe, expect, it } from 'vitest';
import { attr, builtRoutes, findAll, loadRoute, text } from '../helpers/dist-html';

/** The site publishes in KST, so a rendered date must not depend on the build machine. */
const seoulDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .replace(/-/g, '.');

const archiveRoutes = builtRoutes().filter(
  (route) => /^\/blog\/(posts|tags|categories)\//.test(route) || route === '/blog/posts/',
);

describe('published dates', () => {
  it('finds archive pages to check', () => {
    expect(archiveRoutes.length).toBeGreaterThan(5);
  });

  it('renders every archive card date in Asia/Seoul, whatever the build timezone', () => {
    const wrong: string[] = [];

    for (const route of archiveRoutes) {
      const page = loadRoute(route);
      for (const time of findAll(page, (element) => element.tagName === 'time')) {
        const iso = attr(time, 'datetime');
        if (!iso) continue;
        const shown = text(time);
        if (!/^\d{4}\.\d{2}\.\d{2}$/.test(shown)) continue;
        if (shown !== seoulDate(iso)) wrong.push(`${route}: ${iso} rendered as ${shown}, expected ${seoulDate(iso)}`);
      }
    }

    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('shows the same day on a post card and on the post itself', () => {
    const post = '/blog/posts/heap-heapsort/';
    const article = loadRoute(post);
    const time = findAll(article, (element) => element.tagName === 'time')[0];
    const iso = attr(time, 'datetime')!;

    const [, year, month, day] = seoulDate(iso).match(/^(\d{4})\.(\d{2})\.(\d{2})$/)!;
    expect(text(time)).toBe(`${year}년 ${Number(month)}월 ${Number(day)}일`);
  });
});
