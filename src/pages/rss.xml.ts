import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { getPostSlug } from '../domains/blog/content/post-slug';

export async function GET(context: { site: URL | undefined }) {
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (left, right) => right.data.pubDate.valueOf() - left.data.pubDate.valueOf(),
  );

  return rss({
    title: 'Extransload',
    description: '기록하고, 더 나은 답을 찾습니다.',
    site: context.site ?? 'https://extransload.github.io',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/posts/${getPostSlug(post)}/`,
    })),
  });
}
