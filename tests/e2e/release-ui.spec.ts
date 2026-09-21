import { expect, test } from '@playwright/test';

test('theme menu persists the selected theme after reload', async ({ page }) => {
  await page.goto('/blog/');

  const picker = page.getByRole('switch');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  await picker.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('Pagefind search results navigate to the matching article', async ({ page }) => {
  await page.goto('/blog/search/');

  const search = page.locator('#pagefind-search input').first();
  await expect(search).toBeVisible();
  await search.fill('git reset');

  const result = page.locator('a.pagefind-ui__result-link[href="/blog/posts/git-reset-vs-git-revert/"]');
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/blog\/posts\/git-reset-vs-git-revert\/(?:#.*)?$/);
});

test('article comments use the canonical page key without login', async ({ page }) => {
  await page.route('**/api/comments/post-like?**', (route) => route.fulfill({ json: { likes: 3, liked: false } }));
  await page.route('**/api/comments?**', (route) => route.fulfill({ json: { items: [], total: 0, next: null } }));
  await page.goto('/blog/posts/git-reset-vs-git-revert/');

  await expect(page.locator('[data-comments]')).toHaveAttribute('data-page', '/blog/posts/git-reset-vs-git-revert/');
  await expect(page.locator('[data-compose]')).toBeVisible();
  await expect(page.locator('[data-post-like-count]')).toHaveText('3');
  await expect(page.locator('[data-compose] [name=nickname]')).toHaveValue(/^[가-힣]{6,20}$/);
  await expect(page.locator('[data-reload]')).toHaveCount(0);
  await expect(page.locator('[data-compose] [name=password]')).toHaveAttribute('autocomplete', 'off');
});

test('an authenticated administrator writes post comments and replies without anonymous credentials', async ({
  page,
}) => {
  const parent = {
    id: '11111111-1111-4111-8111-111111111111',
    page: '/blog/posts/git-reset-vs-git-revert/',
    parentId: null,
    nickname: '방문자',
    body: '좋은 글입니다.',
    visibility: 'public',
    version: 1,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    likes: 0,
    liked: false,
  };
  const reply = {
    ...parent,
    id: '22222222-2222-4222-8222-222222222222',
    parentId: parent.id,
    nickname: 'Extransload',
    body: '고맙습니다.',
  };
  const administratorRequests: Array<{ page: string; body: string; parentId?: string }> = [];
  await page.route('**/api/comments/post-like?**', (route) => route.fulfill({ json: { likes: 0, liked: false } }));
  await page.route('**/api/comments?**', (route) =>
    route.fulfill({
      json: {
        items: administratorRequests.length > 1 ? [parent, reply] : [parent],
        total: administratorRequests.length > 1 ? 2 : 1,
        next: null,
        admin: true,
      },
    }),
  );
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { user: { id: 1, login: 'admin' }, csrfToken: 'test-csrf' } }),
  );
  await page.route('**/api/comments/admin', (route) => {
    administratorRequests.push(route.request().postDataJSON() as { page: string; body: string; parentId?: string });
    return route.fulfill({ status: 201, json: { id: crypto.randomUUID() } });
  });
  await page.goto('/blog/posts/git-reset-vs-git-revert/');

  const compose = page.locator('[data-compose]');
  await expect(compose.locator('[name=nickname]')).toBeHidden();
  await expect(compose.locator('[name=password]')).toBeHidden();
  await expect(compose.getByText('Extransload 이름으로 공개 댓글이 등록됩니다.')).toBeVisible();
  await compose.locator('[name=body]').fill('관리자 댓글입니다.');
  await compose.getByRole('button', { name: '관리자 댓글 등록' }).click();
  await expect.poll(() => administratorRequests.length).toBe(1);
  expect(administratorRequests[0]).toEqual({ page: parent.page, body: '관리자 댓글입니다.' });

  await page.locator(`[data-comment-id="${parent.id}"] [data-action=reply]`).click();
  const replyEditor = page.locator(`[data-comment-id="${parent.id}"] .comment-editor`);
  await expect(replyEditor.locator('[name=nickname]')).toHaveCount(0);
  await expect(replyEditor.locator('[name=password]')).toHaveCount(0);
  await replyEditor.locator('[name=body]').fill('고맙습니다.');
  await replyEditor.getByRole('button', { name: '답글 등록' }).click();
  await expect.poll(() => administratorRequests.length).toBe(2);
  expect(administratorRequests[1]).toEqual({ page: parent.page, parentId: parent.id, body: '고맙습니다.' });
  await expect(page.locator(`[data-comment-id="${reply.id}"] .comment-meta strong`)).toHaveText('Extransload');
  await expect(page.locator(`[data-comment-id="${parent.id}"] > .comment-actions [data-action=edit]`)).toHaveCount(1);
  await expect(page.locator(`[data-comment-id="${parent.id}"] > .comment-actions [data-action=delete]`)).toHaveCount(1);
  await expect(
    page.locator(`[data-comment-id="${reply.id}"] > .comment-meta .comment-author--administrator`),
  ).toBeVisible();
  await expect(page.locator(`[data-comment-id="${reply.id}"] > .comment-actions [data-action=edit]`)).toHaveCount(1);
  await expect(page.locator(`[data-comment-id="${reply.id}"] > .comment-actions [data-action=delete]`)).toHaveCount(1);
});

test('a visitor can enter a password to edit or delete a comment', async ({ page }) => {
  const comment = {
    id: '11111111-1111-4111-8111-111111111111',
    page: '/blog/posts/git-reset-vs-git-revert/',
    parentId: null,
    nickname: '방문자',
    body: '좋은 글입니다.',
    visibility: 'public',
    version: 1,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    likes: 0,
    liked: false,
  };
  const administratorComment = {
    ...comment,
    id: '22222222-2222-4222-8222-222222222222',
    nickname: 'Extransload',
    body: '관리자 답글입니다.',
  };
  await page.route('**/api/comments/post-like?**', (route) => route.fulfill({ json: { likes: 0, liked: false } }));
  await page.route('**/api/comments?**', (route) =>
    route.fulfill({ json: { items: [comment, administratorComment], total: 2, next: null, admin: false } }),
  );
  await page.goto('/blog/posts/git-reset-vs-git-revert/');

  const entry = page.locator(`[data-comment-id="${comment.id}"]`);
  await expect(entry.locator(':scope > .comment-actions [data-action=edit]')).toHaveCount(1);
  await expect(entry.locator(':scope > .comment-actions [data-action=delete]')).toHaveCount(1);
  await entry.locator('[data-action=edit]').click();
  await expect(entry.locator('.comment-editor [name=password]')).toBeVisible();
  const administratorEntry = page.locator(`[data-comment-id="${administratorComment.id}"]`);
  await expect(administratorEntry.locator(':scope > .comment-actions [data-action=edit]')).toHaveCount(0);
  await expect(administratorEntry.locator(':scope > .comment-actions [data-action=delete]')).toHaveCount(0);
});

test('guestbook has a separate anonymous comment page', async ({ page }) => {
  await page.route('**/api/comments?**', (route) => route.fulfill({ json: { items: [], total: 0, next: null } }));
  await page.goto('/guestbook/');

  await expect(page).toHaveURL('/guestbook/');
  await expect(page.getByRole('heading', { name: '방명록' })).toBeVisible();
  await expect(page.locator('[data-comments]')).toHaveAttribute('data-page', '/guestbook/');
  await expect(page.getByRole('button', { name: '완료', exact: true })).toBeVisible();
  await expect(page.locator('[data-post-like]')).toHaveCount(0);
});
