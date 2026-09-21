import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** Posts shown on one archive page. */
export const POSTS_PER_PAGE = 10;

const byNewest = (a: Post, b: Post) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

/** Every published post, newest first. */
export async function publishedPosts(): Promise<Post[]> {
  return (await getCollection('posts', ({ data }) => !data.draft)).sort(byNewest);
}

/** Groups published posts by a frontmatter facet, each group newest first. */
export async function postsGroupedBy(facet: (post: Post) => string[]): Promise<Map<string, Post[]>> {
  const groups = new Map<string, Post[]>();
  for (const post of await publishedPosts()) {
    for (const key of facet(post)) {
      groups.set(key, [...(groups.get(key) ?? []), post]);
    }
  }
  return groups;
}

export function pageCount(total: number): number {
  return Math.ceil(total / POSTS_PER_PAGE);
}

export function pageSlice(posts: Post[], currentPage: number): Post[] {
  const start = (currentPage - 1) * POSTS_PER_PAGE;
  return posts.slice(start, start + POSTS_PER_PAGE);
}

/**
 * Page numbers that need their own route. Page one lives at the bare archive
 * path, so numbered routes start at two and never duplicate it.
 */
export function overflowPages(total: number): number[] {
  return Array.from({ length: Math.max(0, pageCount(total) - 1) }, (_, index) => index + 2);
}
