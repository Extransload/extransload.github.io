import type { liveApi } from './api';
import type { Post, ReportResponse } from './contracts';

const now = () => new Date().toISOString();
const posts: Post[] = ['published', 'draft', 'published_with_draft'].map((status, index) => ({
  id: `preview-${index}`,
  slug: `preview-${index}`,
  version: 1,
  title: ['서재를 만드는 기록', '아직 쓰고 있는 생각', '작은 도구를 만드는 즐거움'][index],
  description: '디자인 미리보기를 위한 샘플 글입니다.',
  category: ['일상', 'Study', 'project'][index],
  tags: ['기록', '디자인'],
  pubDate: now().slice(0, 10),
  updatedAt: now(),
  body: '# 기록의 시작\n\n이 글은 개발환경에서만 사용하는 샘플입니다.\n\n## 메모\n\n문장을 고치고 저장해 보세요.',
  desiredVisibility: status === 'draft' ? 'draft' : 'published',
  status: status as Post['status'],
}));
const find = (id: string) => {
  const post = posts.find((post) => post.id === id);
  if (!post) throw new Error('글을 찾을 수 없습니다.');
  return post;
};
const snapshots = new Map(
  posts.filter((post) => post.desiredVisibility === 'published').map((post) => [post.id, structuredClone(post)]),
);

export const previewApi: typeof liveApi = {
  async discard(input) {
    const post = find(input.id);
    if (post.version !== input.version) throw new Error('다른 저장 결과가 있어 다시 불러와야 합니다.');
    const snapshot = snapshots.get(post.id);
    if (snapshot)
      Object.assign(post, structuredClone(snapshot), {
        version: post.version + 1,
        status: snapshot.desiredVisibility,
        updatedAt: now(),
      });
    else posts.splice(posts.indexOf(post), 1);
  },
  async session() {
    return { user: { id: 0, login: 'local-preview' }, csrfToken: 'preview-only' };
  },
  async posts(visibility = 'all') {
    return {
      items: structuredClone(posts.filter((post) => visibility === 'all' || post.desiredVisibility === visibility)),
    };
  },
  async comments() {
    return { items: [], total: 0, baseUrl: 'https://extransload.github.io' };
  },
  async importPosts() {
    return { imported: 0, unchanged: posts.length, failed: 0 };
  },
  async post(id) {
    return structuredClone(find(id));
  },
  async create(input) {
    const post: Post = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      slug: 'local-draft',
      version: 1,
      desiredVisibility: 'draft',
      status: 'draft',
      updatedAt: now(),
    };
    posts.unshift(post);
    return structuredClone(post);
  },
  async save(input) {
    const post = find(input.id);
    if (input.version !== post.version) throw new Error('다른 저장 결과가 있어 다시 불러와야 합니다.');
    Object.assign(post, structuredClone(input), {
      version: post.version + 1,
      updatedAt: now(),
      status: post.desiredVisibility === 'published' ? 'published_with_draft' : 'draft',
    });
    return { version: post.version, savedAt: post.updatedAt };
  },
  async publish(input, _csrf, unpublish = false) {
    const post = find(input.id);
    post.desiredVisibility = unpublish ? 'draft' : 'published';
    post.status = post.desiredVisibility;
    snapshots.set(post.id, structuredClone(post));
    return { operationId: crypto.randomUUID(), state: 'committed' };
  },
  async logout() {},
  async report(name, start, end): Promise<ReportResponse> {
    const totals = { totalUsers: 1248, screenPageViews: 3862, sessions: 1690 };
    const rows: Record<string, Array<Record<string, string | number>>> = {
      overview: [totals],
      trend: Array.from({ length: 8 }, (_, i) => ({
        date: new Date(Date.parse(end) - (7 - i) * 86400000).toISOString().slice(0, 10),
        totalUsers: 30 + i * 7,
        screenPageViews: 85 + i * 13,
        sessions: 42 + i * 9,
      })),
      posts: posts.map((post, i) => ({
        pagePath: `/blog/posts/${post.slug}/`,
        screenPageViews: 640 - i * 110,
        totalUsers: 320 - i * 50,
      })),
      sources: [
        { sessionSourceMedium: 'google / organic', sessions: 840 },
        { sessionSourceMedium: '(direct) / (none)', sessions: 610 },
      ],
      countries: [
        { country: 'South Korea', totalUsers: 1040 },
        { country: 'United States', totalUsers: 140 },
      ],
      devices: [
        { deviceCategory: 'desktop', totalUsers: 760 },
        { deviceCategory: 'mobile', totalUsers: 488 },
      ],
      search: [{ query: '개인 서재', clicks: 42, impressions: 840, ctr: 0.05, position: 4.2 }],
    };
    if (!rows[name]) throw new Error('통계 리포트를 찾을 수 없습니다.');
    return {
      source: name === 'search' ? 'search-console' : 'ga4',
      status: 'ok',
      period: { start, end },
      fetchedAt: now(),
      stale: false,
      totals,
      rows: structuredClone(rows[name]),
      warnings: [],
    };
  },
};
