import { expect, it, vi } from 'vitest';
import { previewApi } from '../src/preview-api';
import { discardPost } from '../worker/posts';
vi.mock('../worker/auth', () => ({ requireMutation: async () => ({ session: {} }) }));
vi.mock('../worker/github', () => ({
  getRepoFile: async () => {
    throw new Error('offline');
  },
}));

it('deletes a local-only draft and refuses stale versions', async () => {
  const post = await previewApi.create(
    { title: 'draft', description: '', category: 'Study', body: 'body', tags: [], pubDate: '2026-09-08' },
    'csrf',
  );
  await expect(previewApi.discard({ ...post, version: 0 }, 'csrf')).rejects.toThrow();
  await previewApi.discard(post, 'csrf');
  await expect(previewApi.post(post.id)).rejects.toThrow();
});
it('discards edits but preserves the published post', async () => {
  const post = await previewApi.create(
    { title: 'original', description: '', category: 'Study', body: 'original body', tags: [], pubDate: '2026-09-08' },
    'csrf',
  );
  await previewApi.publish(post, 'csrf');
  const saved = await previewApi.save({ ...(await previewApi.post(post.id)), title: 'modified' }, 'csrf');
  await previewApi.discard({ ...(await previewApi.post(post.id)), version: saved.version }, 'csrf');
  expect((await previewApi.post(post.id)).title).toBe('original');
});
it('does not delete a repository-backed draft when GitHub cannot be read', async () => {
  let mutations = 0;
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: 'p', version: 2, repo_path: 'post.md' }),
          run: async () => {
            mutations++;
          },
        }),
      }),
    },
  };
  const response = await discardPost(
    new Request('https://admin.test/api/posts/p', { method: 'DELETE', body: JSON.stringify({ expectedVersion: 2 }) }),
    env as never,
    'p',
  );
  expect(response.status).toBe(502);
  expect(mutations).toBe(0);
});
