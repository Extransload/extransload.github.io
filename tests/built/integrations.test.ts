import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attr, builtRoutes, find, loadRoute, rawRoute } from '../helpers/dist-html';

const clientBundles = () =>
  readdirSync('dist/_astro')
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(`dist/_astro/${name}`, 'utf8'));

describe('comments integration', () => {
  it('points the comment widget at the Worker API, never at a shared secret', () => {
    const post = loadRoute('/blog/posts/git-reset-vs-git-revert/');
    const root = find(post, (element) => attr(element, 'data-comments') !== undefined);

    expect(root).toBeDefined();
    expect(attr(root!, 'data-api')).toMatch(/^https?:\/\//);
  });

  it('scopes post comments and the guestbook to distinct page keys', () => {
    const post = loadRoute('/blog/posts/git-reset-vs-git-revert/');
    const guestbook = loadRoute('/guestbook/');
    const key = (route: ReturnType<typeof loadRoute>) =>
      attr(
        find(route, (element) => attr(element, 'data-comments') !== undefined)!,
        'data-page',
      );

    expect(key(post)).toBe('/blog/posts/git-reset-vs-git-revert/');
    expect(key(guestbook)).toBe('/guestbook/');
  });

  it('never ships a comment secret or a third-party comment host to the browser', () => {
    const shipped = [...clientBundles(), ...builtRoutes().map(rawRoute)].join('\n');

    expect(shipped).not.toContain('COMMENTS_SECRET');
    expect(shipped).not.toContain('giscus.app');
  });

  it('ships both embroidered like-button states', () => {
    expect(existsSync('dist/images/heart-embroidered-empty.webp')).toBe(true);
    expect(existsSync('dist/images/heart-embroidered-filled.webp')).toBe(true);
  });
});

describe('analytics integration', () => {
  it('ships no analytics tag when no measurement ID is configured', () => {
    const shipped = [...clientBundles(), ...builtRoutes().map(rawRoute)].join('\n');

    // The build under test runs without PUBLIC_GA_MEASUREMENT_ID, so an emitted
    // tag would mean the ID was hardcoded rather than read from the environment.
    expect(shipped).not.toContain('googletagmanager.com/gtag');
    expect(shipped).not.toMatch(/G-[A-Z0-9]{8,}/);
  });
});
