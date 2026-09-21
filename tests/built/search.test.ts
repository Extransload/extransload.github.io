import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attr, find, loadRoute, rawRoute, text } from '../helpers/dist-html';

describe('Pagefind search', () => {
  it('ships a generated search index with the site', () => {
    expect(existsSync('dist/pagefind/pagefind.js')).toBe(true);
    expect(existsSync('dist/pagefind/pagefind-entry.json')).toBe(true);
  });

  it('mounts the full search UI on the dedicated search page', () => {
    const page = loadRoute('/blog/search/');

    expect(find(page, (element) => attr(element, 'id') === 'pagefind-search')).toBeDefined();
  });

  it('drops the dev-only "no index yet" notice from production builds', () => {
    // The notice is gated on import.meta.env.DEV; shipping it would mean the
    // gate stopped working and readers would see a false empty-state message.
    expect(rawRoute('/blog/search/')).not.toContain('개발 서버에서는 Pagefind 색인이 생성되지 않습니다');
  });

  it('gives the blog home its own search field wired to the same engine', () => {
    const home = loadRoute('/blog/');

    expect(find(home, (element) => attr(element, 'data-home-search-input') !== undefined)).toBeDefined();
    expect(find(home, (element) => attr(element, 'data-home-search-results') !== undefined)).toBeDefined();
    expect(find(home, (element) => attr(element, 'id') === 'pagefind-search-home')).toBeDefined();
  });

  it('offers a search control in the shared header', () => {
    const page = loadRoute('/blog/posts/');
    const control = find(page, (element) => attr(element, 'data-search-open') !== undefined);

    expect(control).toBeDefined();
    expect(attr(control!, 'aria-label')).toBe('검색 열기');
  });

  it('keeps the search page out of its own index', () => {
    expect(text(loadRoute('/blog/search/')).length).toBeGreaterThan(0);
    expect(rawRoute('/blog/search/')).toContain('data-pagefind-ignore');
  });
});
