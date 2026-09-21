import type { Post, PostInput, ReportResponse } from './contracts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error
        ? String(payload.error.message)
        : `요청 실패 (${response.status})`;
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const liveApi = {
  discard: (post: Post, csrfToken: string) =>
    request<void>(`/api/posts/${encodeURIComponent(post.id)}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ expectedVersion: post.version }),
    }),
  session: () => request<{ user: { id: number; login: string }; csrfToken: string }>('/api/session'),
  posts: (visibility = 'all') => request<{ items: Post[]; nextCursor?: string }>(`/api/posts?visibility=${visibility}`),
  comments: () =>
    request<{
      items: Array<{
        id: string;
        page: string;
        parentId: string | null;
        nickname: string;
        body: string;
        visibility: 'public' | 'private';
        createdAt: string;
        postTitle: string;
      }>;
      total: number;
      baseUrl: string;
    }>('/api/admin/comments'),
  importPosts: (csrfToken: string) =>
    request<{ imported: number; unchanged: number; failed: number }>('/api/posts/import', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
    }),
  post: (id: string) => request<Post>(`/api/posts/${encodeURIComponent(id)}`),
  create: (input: PostInput, csrfToken: string) =>
    request<Post>('/api/posts', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(input),
    }),
  save: (post: Post, csrfToken: string) =>
    request<{ version: number; savedAt: string }>(`/api/posts/${encodeURIComponent(post.id)}`, {
      method: 'PUT',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ ...post, expectedVersion: post.version }),
    }),
  report: (name: string, start: string, end: string) =>
    request<ReportResponse>(`/api/analytics/${name}?start=${start}&end=${end}`),
  publish: (post: Post, csrfToken: string, unpublish = false) =>
    request<{ operationId: string; state: string; commitSha?: string }>(
      `/api/posts/${encodeURIComponent(post.id)}/${unpublish ? 'unpublish' : 'publish'}`,
      {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ expectedVersion: post.version }),
      },
    ),
  logout: (csrfToken: string) =>
    request<void>('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } }),
};

// Vite removes the preview import from production builds.
export const api: typeof liveApi = import.meta.env.DEV ? (await import('./preview-api')).previewApi : liveApi;
