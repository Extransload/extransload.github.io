import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getPostSlug } from '../../src/domains/blog/content/post-slug';

const require = createRequire(import.meta.url);
const astroDist = resolve(dirname(require.resolve('astro/package.json')), 'dist');
const { resolveConfig, createSettings, createNodeLogger } = await import(
  pathToFileURL(join(astroDist, 'core/config/index.js')).href
);
const { createContainer } = await import(pathToFileURL(join(astroDist, 'core/dev/container.js')).href);

let container: Awaited<ReturnType<typeof createContainer>>;

beforeAll(async () => {
  const root = process.cwd();
  const { astroConfig } = await resolveConfig({ root }, 'dev');
  const settings = await createSettings(astroConfig, root);
  container = await createContainer({
    isRestart: true,
    inlineConfig: { root },
    logger: createNodeLogger({ logLevel: 'silent' }),
    settings,
  });
});

afterAll(async () => {
  await container?.close();
});

describe('post content', () => {
  it('loads every post through Astro with unique slugs', async () => {
    const { getCollection } = await container.viteServer.ssrLoadModule('astro:content');
    const posts = await getCollection('posts');

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post: { data: { pubDate: unknown } }) => post.data.pubDate instanceof Date)).toBe(true);
    const slugs: string[] = posts.map((post: { id: string }) => getPostSlug(post));
    expect(new Set(slugs).size).toBe(posts.length);
    expect(slugs.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))).toBe(true);
  });
});
