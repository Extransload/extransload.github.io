import { getCollection } from 'astro:content';
import { getPostSlug } from '../domains/blog/content/post-slug';

export async function GET() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return new Response(
    JSON.stringify({ posts: posts.map((post) => ({ slug: getPostSlug(post), category: post.data.category })) }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } },
  );
}
