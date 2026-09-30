import { describe, expect, it } from 'vitest';
import { splashChapters } from '../../src/domains/main/data/splash-chapters';
import { attr, builtRoutes, byClass, find, links, loadRoute, routeExists, tag, text } from '../helpers/dist-html';

const PUBLISHED_ROUTES = [
  '/',
  '/blog/',
  '/blog/posts/',
  '/blog/categories/',
  '/blog/search/',
  '/blog/tools/markdown-viewer/',
  '/works/',
  '/games/',
  '/playroom/',
  '/playroom/gomoku/',
  '/about/',
  '/guestbook/',
];

describe('published routes', () => {
  it.each(PUBLISHED_ROUTES)('builds %s', (route) => {
    expect(routeExists(route)).toBe(true);
  });

  it('no longer builds the retired portfolio space', () => {
    expect(routeExists('/portfolio/')).toBe(false);
  });

  it('gives every splash chapter a destination that is actually built', () => {
    for (const chapter of splashChapters) {
      expect(routeExists(chapter.href), `${chapter.label} → ${chapter.href}`).toBe(true);
    }
  });

  it('links the splash cover to each chapter destination', () => {
    const home = loadRoute('/');
    const hrefs = new Set(links(home));

    for (const chapter of splashChapters) {
      expect(hrefs.has(chapter.href), `splash is missing a link to ${chapter.href}`).toBe(true);
    }
  });

  it('keeps the splash free of blog reading furniture', () => {
    const home = loadRoute('/');

    expect(byClass(home, 'post-card')).toHaveLength(0);
    expect(byClass(home, 'site-header')).toHaveLength(0);
  });
});

describe('sidebar navigation', () => {
  it('points every sidebar link at a built route', () => {
    const blog = loadRoute('/blog/');
    const nav = find(blog, (element) => element.tagName === 'nav');
    expect(nav).toBeDefined();

    const targets = links(nav!).map((href) => href.split('?')[0]);
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      expect(routeExists(target), `sidebar link ${target} has no built page`).toBe(true);
    }
  });

  it('marks the current blog section without matching sibling sections', () => {
    const blogHome = loadRoute('/blog/');
    const current = byClass(blogHome, 'is-current').map((element) => attr(element, 'href'));

    expect(current).toContain('/blog/');
    expect(current).not.toContain('/blog/posts/');
  });
});

describe('blog archives', () => {
  it('makes the blog home a search-first landing page', () => {
    const blogHome = loadRoute('/blog/');

    expect(find(blogHome, (element) => attr(element, 'id') === 'pagefind-search-home')).toBeDefined();
    expect(byClass(blogHome, 'post-card')).toHaveLength(0);
  });

  it('lists posts as unnumbered cards', () => {
    const archive = loadRoute('/blog/posts/');
    const cards = byClass(archive, 'post-card');

    expect(cards.length).toBeGreaterThan(0);
    expect(byClass(archive, 'post-card__number')).toHaveLength(0);
  });

  it('paginates the post archive with links that resolve', () => {
    const archive = loadRoute('/blog/posts/');
    const pageLinks = links(archive).filter((href) => /^\/blog\/posts\/\d+\/$/.test(href));

    expect(pageLinks.length).toBeGreaterThan(0);
    for (const href of pageLinks) {
      expect(routeExists(href), `pagination link ${href} has no built page`).toBe(true);
    }
  });

  it('starts numbered archive pages at page two so page one keeps one URL', () => {
    expect(routeExists('/blog/posts/1/')).toBe(false);
    expect(routeExists('/blog/posts/2/')).toBe(true);
  });

  it('reports the size of the whole archive, not the size of one page', () => {
    const archive = loadRoute('/blog/posts/');
    const published = builtRoutes().filter(
      (route) => /^\/blog\/posts\/[^/]+\/$/.test(route) && !/\/\d+\/$/.test(route),
    );
    const summary = text(byClass(archive, 'archive-page__header')[0]);

    expect(published.length).toBeGreaterThan(10);
    expect(summary).toContain(`${published.length}개의 기록`);
  });

  it('gives each archive page a heading that names the collection', () => {
    const categories = loadRoute('/blog/categories/');
    const heading = tag(categories, 'h1')[0];

    expect(heading).toBeDefined();
    expect(text(heading!).length).toBeGreaterThan(0);
  });
});

describe('post pages', () => {
  it('renders article content with a title for a published post', () => {
    const post = loadRoute('/blog/posts/git-reset-vs-git-revert/');

    expect(tag(post, 'h1')[0]).toBeDefined();
    expect(byClass(post, 'article__content').length).toBeGreaterThan(0);
  });
});
