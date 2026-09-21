import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { adminComments, commentsApi } from '../worker/comments';
import { sha256 } from '../worker/security';
import type { Env } from '../worker/types';

let db: DatabaseSync;
let env: Env;
const page = '/blog/posts/test/';
const visitor = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const file of readdirSync('worker/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(readFileSync(`worker/migrations/${file}`, 'utf8'));
  const prepare = (sql: string) => {
    let values: any[] = [];
    const statement = {
      bind(...args: any[]) {
        values = args;
        return statement;
      },
      async first() {
        return db.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...values) };
      },
      async run() {
        if (sql.trimStart().startsWith('SELECT'))
          return { results: db.prepare(sql).all(...values), meta: { changes: 0 } };
        const result = db.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) }, results: [] };
      },
    };
    return statement;
  };
  env = {
    DB: {
      prepare,
      async batch(statements: any[]) {
        db.exec('BEGIN');
        try {
          const results = [];
          for (const s of statements) results.push(await s.run());
          db.exec('COMMIT');
          return results;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
    },
    COMMENTS_SECRET: 'local-test-only',
    GITHUB_ALLOWED_USER_ID: '1',
  } as unknown as Env;
});
afterEach(() => db.close());
async function call(path = '', method = 'GET', body?: unknown) {
  return commentsApi(
    new Request(`https://worker.test/api/comments${path}`, {
      method,
      headers: {
        Origin: 'https://extransload.github.io',
        'Content-Type': 'application/json',
        'X-Comment-Visitor': visitor,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}
const input = {
  page,
  nickname: '다정한-수달-1234',
  password: '1234',
  body: '비공개 내용 <script>',
  visibility: 'private',
};
it('keeps post likes idempotent and independent from comment likes', async () => {
  const path = `/post-like?page=${encodeURIComponent(page)}`;
  expect(await (await call(path, 'PUT', { liked: true })).json()).toMatchObject({ likes: 1, liked: 1 });
  expect(await (await call(path, 'PUT', { liked: true })).json()).toMatchObject({ likes: 1 });
  expect(db.prepare('SELECT COUNT(*) AS n FROM comment_likes').get()).toMatchObject({ n: 0 });
  const { id } = (await (await call('', 'POST', input)).json()) as any;
  expect(await (await call(`/${id}/like`, 'PUT', { liked: true })).json()).toMatchObject({ likes: 1 });
  expect(await (await call(path, 'PUT', { liked: false })).json()).toMatchObject({ likes: 0, liked: 0 });
  expect(db.prepare('SELECT COUNT(*) AS n FROM comment_likes').get()).toMatchObject({ n: 1 });
});
it('masks private content and requires the correct password or admin session', async () => {
  const { id } = (await (await call('', 'POST', input)).json()) as { id: string };
  const listed = (await (await call(`?page=${encodeURIComponent(page)}`)).json()) as any;
  expect(listed.items[0]).toMatchObject({ nickname: null, body: null });
  expect((await call(`/${id}/reveal`, 'POST', { password: '0000' })).status).toBe(403);
  expect(await (await call(`/${id}/reveal`, 'POST', { password: '1234' })).json()).toMatchObject({ body: input.body });
  expect((await adminComments(new Request('https://worker.test/admin/comments'), env)).status).toBe(401);
  db.prepare(
    'INSERT INTO sessions (token_hash,github_user_id,github_login,csrf_hash,expires_at) VALUES (?,?,?,?,?)',
  ).run(await sha256('test-session'), 1, 'test', 'test', '2099-01-01');
  const response = await adminComments(
    new Request('https://worker.test/admin/comments', { headers: { Cookie: '__Host-admin_session=test-session' } }),
    env,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('비공개 내용 &lt;script&gt;');
});
it('reserves the administrator nickname and creates administrator comments only for a valid admin session', async () => {
  expect((await call('', 'POST', { ...input, nickname: ' 관리자 ' })).status).toBe(422);
  expect((await call('', 'POST', { ...input, nickname: ' Extransload ' })).status).toBe(422);
  const session = 'admin-session';
  const csrf = 'admin-csrf';
  db.prepare(
    'INSERT INTO sessions (token_hash,github_user_id,github_login,csrf_hash,expires_at) VALUES (?,?,?,?,?)',
  ).run(await sha256(session), 1, 'admin', await sha256(csrf), '2099-01-01');
  const adminCall = (body: unknown) =>
    commentsApi(
      new Request('https://worker.test/api/comments/admin', {
        method: 'POST',
        headers: {
          Origin: 'https://extransload.github.io',
          Cookie: `__Host-admin_session=${session}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  const { id: parentId } = (await (await adminCall({ page, body: '관리자 댓글' })).json()) as { id: string };
  expect(db.prepare('SELECT nickname, visibility, password_hash FROM comments WHERE id=?').get(parentId)).toMatchObject(
    { nickname: 'Extransload', visibility: 'public' },
  );
  expect(
    (await adminCall({ page, parentId, body: '관리자 답글', nickname: '임의 이름', visibility: 'private' })).status,
  ).toBe(201);
  expect(
    db.prepare('SELECT nickname, body, visibility, parent_id FROM comments WHERE parent_id=?').get(parentId),
  ).toMatchObject({ nickname: 'Extransload', body: '관리자 답글', visibility: 'public', parent_id: parentId });
});
it('lets an authenticated administrator edit and delete administrator comments without a password', async () => {
  const session = 'admin-session';
  const csrf = 'admin-csrf';
  db.prepare(
    'INSERT INTO sessions (token_hash,github_user_id,github_login,csrf_hash,expires_at) VALUES (?,?,?,?,?)',
  ).run(await sha256(session), 1, 'admin', await sha256(csrf), '2099-01-01');
  const adminCall = (path: string, method: string, body: unknown) =>
    commentsApi(
      new Request(`https://worker.test/api/comments${path}`, {
        method,
        headers: {
          Origin: 'https://extransload.github.io',
          Cookie: `__Host-admin_session=${session}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  const { id } = (await (await adminCall('/admin', 'POST', { page, body: '관리자 댓글' })).json()) as { id: string };
  expect((await call(`/${id}`, 'DELETE', { password: '1234', version: 1 })).status).toBe(403);
  expect(
    (await adminCall(`/${id}`, 'PATCH', { nickname: 'Extransload', body: '수정한 관리자 댓글', version: 1 })).status,
  ).toBe(200);
  expect(db.prepare('SELECT nickname, body FROM comments WHERE id=?').get(id)).toMatchObject({
    nickname: 'Extransload',
    body: '수정한 관리자 댓글',
  });
  expect((await adminCall(`/${id}`, 'DELETE', { version: 2 })).status).toBe(200);
  expect(db.prepare('SELECT COUNT(*) AS n FROM comments').get()).toMatchObject({ n: 0 });
});
it('lets an authenticated administrator edit and delete a visitor comment without its password', async () => {
  const { id } = (await (await call('', 'POST', { ...input, visibility: 'public' })).json()) as { id: string };
  const session = 'admin-session';
  const csrf = 'admin-csrf';
  db.prepare(
    'INSERT INTO sessions (token_hash,github_user_id,github_login,csrf_hash,expires_at) VALUES (?,?,?,?,?)',
  ).run(await sha256(session), 1, 'admin', await sha256(csrf), '2099-01-01');
  const adminCall = (method: string, body: unknown) =>
    commentsApi(
      new Request(`https://worker.test/api/comments/${id}`, {
        method,
        headers: {
          Origin: 'https://extransload.github.io',
          Cookie: `__Host-admin_session=${session}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  expect(
    (await adminCall('PATCH', { nickname: input.nickname, body: '관리자가 수정한 댓글', version: 1 })).status,
  ).toBe(200);
  expect(db.prepare('SELECT body FROM comments WHERE id=?').get(id)).toMatchObject({ body: '관리자가 수정한 댓글' });
  expect((await adminCall('DELETE', { version: 2 })).status).toBe(200);
  expect(db.prepare('SELECT COUNT(*) AS n FROM comments').get()).toMatchObject({ n: 0 });
});
it('preserves replies on version conflicts and deletes a standalone comment successfully', async () => {
  const { id } = (await (await call('', 'POST', input)).json()) as any;
  await call('', 'POST', { ...input, parentId: id });
  expect((await call(`/${id}`, 'DELETE', { password: '1234', version: 0 })).status).toBe(409);
  expect(db.prepare('SELECT COUNT(*) AS n FROM comments').get()).toMatchObject({ n: 2 });
  expect((await call(`/${id}`, 'DELETE', { password: '1234', version: 1 })).status).toBe(200);
  expect(db.prepare('SELECT COUNT(*) AS n FROM comments').get()).toMatchObject({ n: 0 });
  const single = (await (await call('', 'POST', input)).json()) as any;
  expect((await call(`/${single.id}`, 'DELETE', { password: '1234', version: 1 })).status).toBe(200);
});
