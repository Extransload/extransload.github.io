import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('domain boundaries', () => {
  it('defines the site domain roots', () => {
    for (const path of [
      'src/domains/main',
      'src/domains/blog',
      'src/domains/games',
      'src/shared',
    ]) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it('keeps the root entry independent from blog ownership', () => {
    expect(readFileSync('src/pages/index.astro', 'utf8')).not.toContain('domains/blog');
  });

  it('keeps blog implementation under the blog domain', () => {
    for (const path of [
      'src/domains/blog/content/config.ts',
      'src/domains/blog/content/posts',
      'src/domains/blog/components/PostCard.astro',
      'src/domains/blog/components/CodeShellEnhancer.astro',
      'src/domains/blog/layouts/BlogLayout.astro',
      'src/domains/blog/layouts/PostLayout.astro',
      'src/domains/blog/styles/blog.css',
    ]) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it('keeps main and shared implementation in their owning domains', () => {
    for (const path of [
      'src/domains/main/layouts/SplashLayout.astro',
      'src/domains/main/routes/about.astro',
      'src/domains/main/routes/works.astro',
      'src/domains/main/routes/work-detail.astro',
      'src/domains/main/components/WorkDiagram.astro',
      'src/domains/main/data/work-archive.ts',
      'src/domains/main/styles/works.css',
      'src/domains/main/styles/splash.css',
      'src/shared/layouts/SiteLayout.astro',
      'src/shared/components/Header.astro',
      'src/shared/themes/registry.ts',
    ]) {
      expect(existsSync(path)).toBe(true);
    }
  });

  it('keeps main-owned source independent from blog implementation', () => {
    const source = readFileSync('src/pages/index.astro', 'utf8');
    expect(source).not.toMatch(/PostCard|PostLayout|CodeShellEnhancer|GiscusComments|Pagefind|astro:content/);
  });

  it('keeps games independent and removes the retired portfolio domain', () => {
    for (const path of [
      'src/domains/games/layouts/GamesLayout.astro',
      'src/domains/games/routes/index.astro',
    ]) {
      expect(existsSync(path)).toBe(true);
    }
    expect(existsSync('src/domains/portfolio')).toBe(false);
  });

  it('does not leak blog-only implementation into independent spaces', () => {
    for (const path of ['src/domains/games']) {
      const source = readFileSync(`${path}/routes/index.astro`, 'utf8');
      expect(source).not.toMatch(/PostCard|PostLayout|CodeShellEnhancer|GiscusComments|Pagefind|astro:content/);
    }
  });
});
