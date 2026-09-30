import { describe, expect, it } from 'vitest';
import { attr, builtRoutes, find, findAll, loadRoute, meta, sitemapRoutes, tag, text } from '../helpers/dist-html';

const SITE = 'https://extransload.github.io';
const ROUTES = builtRoutes();
const REDIRECTS = ['/playroom/gomoku/', '/playroom/gomoku/solo/'];
const NON_INDEXABLE = ['/admin/', '/blog/search/', ...REDIRECTS];
// The admin shell is a noindex/nofollow app mount, not a published document.
const PUBLISHED = ROUTES.filter((route) => route !== '/admin/' && !REDIRECTS.includes(route));

// Two routes that differ only in case share one directory on a case-insensitive
// filesystem, so the surviving page can carry its twin's canonical. The sitemap
// still lists both, which is how such a pair is detected.
const collidedByCase = (() => {
  const seen = new Set<string>();
  const collided = new Set<string>();
  for (const route of sitemapRoutes()) {
    const key = route.toLowerCase();
    if (seen.has(key)) collided.add(key);
    seen.add(key);
  }
  return collided;
})();

describe('SEO contract', () => {
  it('builds a non-trivial set of pages', () => {
    expect(ROUTES.length).toBeGreaterThan(50);
    expect(ROUTES).toContain('/');
  });

  it.each(PUBLISHED)('gives %s a single self-referencing canonical URL', (route) => {
    const page = loadRoute(route);
    const canonicals = findAll(page, (element) => element.tagName === 'link' && attr(element, 'rel') === 'canonical');

    expect(canonicals).toHaveLength(1);
    const href = attr(canonicals[0], 'href')!;
    const expected = `${SITE}${encodeURI(route)}`;

    if (collidedByCase.has(route.toLowerCase())) expect(href.toLowerCase()).toBe(expected.toLowerCase());
    else expect(href).toBe(expected);
  });

  it.each(PUBLISHED)('gives %s a title and social card metadata', (route) => {
    const page = loadRoute(route);
    const titles = tag(page, 'title');

    expect(titles).toHaveLength(1);
    expect(text(titles[0]).length).toBeGreaterThan(0);
    expect(meta(page, 'description')).toBeTruthy();
    expect(meta(page, 'og:title')).toBeTruthy();
    expect(meta(page, 'og:description')).toBeTruthy();
    expect(meta(page, 'twitter:card')).toBe('summary_large_image');
    expect(meta(page, 'og:url')).toBe(
      attr(
        find(page, (element) => element.tagName === 'link' && attr(element, 'rel') === 'canonical')!,
        'href',
      ),
    );
  });

  it.each(NON_INDEXABLE)('keeps %s out of the index', (route) => {
    expect(meta(loadRoute(route), 'robots')).toMatch(/^noindex/);
  });

  it('marks every other page as indexable', () => {
    const indexable = ROUTES.filter((route) => !NON_INDEXABLE.includes(route));

    for (const route of indexable) {
      expect(meta(loadRoute(route), 'robots'), route).toBe('index, follow');
    }
  });

  it('keeps non-indexable pages out of the sitemap', () => {
    const listed = sitemapRoutes();

    for (const route of NON_INDEXABLE) {
      expect(listed, `${route} must not be advertised`).not.toContain(route);
    }
  });

  it('lists every indexable page in the sitemap', () => {
    const listed = new Set(sitemapRoutes());

    for (const route of ROUTES.filter((candidate) => !NON_INDEXABLE.includes(candidate))) {
      expect(listed.has(route), `${route} is built but missing from the sitemap`).toBe(true);
    }
  });

  it('points every sitemap entry at a page that exists', () => {
    // A case-insensitive filesystem can merge two routes that differ only in
    // case, so compare against the lowercased set of built routes.
    const built = new Set(ROUTES.map((route) => route.toLowerCase()));

    for (const route of sitemapRoutes()) {
      expect(built.has(route.toLowerCase()), `sitemap lists ${route} with no built page`).toBe(true);
    }
  });

  it('emits parseable JSON-LD on article pages', () => {
    const page = loadRoute('/blog/posts/git-reset-vs-git-revert/');
    const script = find(
      page,
      (element) => element.tagName === 'script' && attr(element, 'type') === 'application/ld+json',
    );

    expect(script).toBeDefined();
    const data = JSON.parse(text(script!));
    expect(data['@type']).toBe('Article');
    expect(data.url).toBe(`${SITE}/blog/posts/git-reset-vs-git-revert/`);
    expect(data.datePublished).toBeTruthy();
  });
});
