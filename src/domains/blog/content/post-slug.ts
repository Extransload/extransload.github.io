interface ContentLayerEntry {
  id: string;
  data?: { slug?: string };
}

export function getPostSlug(post: ContentLayerEntry): string {
  return (
    post.data?.slug ??
    post.id
      .split('/')
      .pop()
      ?.replace(/\.(?:md|mdx)$/i, '') ??
    post.id
  );
}
