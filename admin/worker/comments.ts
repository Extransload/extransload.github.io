import { error, json, sha256 } from './security';
import type { Env } from './types';
import { requireMutation, requireSession } from './auth';

export async function adminComments(request: Request, env: Env) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response!;
  const offset = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get('offset')) || 0));
  const rows = await env.DB.prepare(
    'SELECT id, page, parent_id, nickname, body, visibility, created_at FROM comments ORDER BY created_at DESC, id DESC LIMIT 200 OFFSET ?',
  )
    .bind(offset)
    .all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM comments').first<{ total: number }>();
  const escape = (value: unknown) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
    );
  const cards = rows.results
    .map(
      (row) =>
        `<article class="comment-card"><div class="card-top"><span class="badge ${row.visibility === 'private' ? 'badge-private' : 'badge-public'}">${row.visibility === 'private' ? '비공개' : '공개'}</span><time>${escape(row.created_at)}</time></div><div class="card-meta"><strong>${escape(row.nickname)}</strong><a href="${escape(row.page)}" target="_blank" rel="noopener">${escape(row.page)}</a></div><pre>${escape(row.body)}</pre>${row.parent_id ? '<p class="reply-note">대댓글</p>' : `<form class="reply" data-reply><input type="hidden" name="page" value="${escape(row.page)}"><input type="hidden" name="parentId" value="${escape(row.id)}"><input type="hidden" name="nickname" value="Extransload"><input type="hidden" name="visibility" value="public"><label>답글<textarea name="body" required maxlength="3000" placeholder="이 댓글에 답글을 남겨보세요."></textarea></label><div class="reply-actions"><span class="hint">게시글에 공개 답글로 등록됩니다.</span><button type="submit">답글 등록</button><span role="status"></span></div></form>`}</article>`,
    )
    .join('');
  const script = `<script>document.querySelectorAll('form[data-reply]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');const status=form.querySelector('[role=status]');button.disabled=true;status.textContent='등록 중…';try{const session=await fetch('/api/session').then(r=>r.json());const response=await fetch('/admin/comments/reply',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(Object.fromEntries(new FormData(form)))});if(!response.ok)throw new Error((await response.json()).error?.message||'답글을 등록하지 못했습니다.');status.textContent='답글을 등록했습니다.';form.querySelector('textarea').value='';}catch(error){status.textContent=error.message;status.dataset.error='true';}finally{button.disabled=false;}}));</script>`;
  const style = `<style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif;color:#292d42;background:#f7f8fc}*{box-sizing:border-box}body{margin:0;min-width:360px}.admin-page{max-width:980px;margin:0 auto;padding:42px 28px 80px}.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:54px}.brand{font-weight:750;text-decoration:none;color:inherit}.brand small{display:block;color:#858a9e;font-size:11px;font-weight:500;margin-top:2px}.back{color:#7564e8;text-decoration:none;font-size:13px}.eyebrow{font-size:10px;letter-spacing:2px;color:#7564e8;font-weight:700;margin:0}.heading{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:28px}.heading h1{font-size:32px;letter-spacing:-1.4px;margin:10px 0}.heading p{color:#858a9e;margin:0;font-size:13px}.count{padding:8px 12px;background:#efecff;color:#6c5bd7;border-radius:20px;font-size:12px;font-weight:600}.comment-list{display:grid;gap:16px}.comment-card{background:#fff;border:1px solid #eceef5;border-radius:20px;padding:22px 24px;box-shadow:0 4px 20px #30354a05}.card-top,.card-meta,.reply-actions{display:flex;align-items:center;gap:10px}.card-top{justify-content:space-between;color:#858a9e;font-size:11px}.badge{border-radius:20px;padding:4px 8px;font-size:10px;font-weight:700}.badge-private{color:#bc935b;background:#fff3e6}.badge-public{color:#439e7f;background:#eaf8f1}.card-meta{margin-top:14px}.card-meta strong{font-size:14px}.card-meta a{color:#858a9e;font-size:12px;text-decoration:none;overflow-wrap:anywhere}.comment-card pre{font:14px/1.8 inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 0 22px;color:#4b5165}.reply{border-top:1px solid #eceef5;padding-top:18px}.reply-note{margin:0;color:#858a9e;font-size:11px}.reply label{display:grid;gap:8px;color:#767c91;font-size:12px;font-weight:600}.reply textarea{width:100%;min-height:86px;resize:vertical;border:1px solid #e7e9f1;border-radius:11px;padding:12px 14px;background:#fafbfe;color:#34394e;font:13px/1.7 inherit}.reply-actions{margin-top:10px}.reply-actions .hint{margin-right:auto;color:#858a9e;font-size:11px}.reply button{border:0;border-radius:11px;padding:10px 16px;background:#7564e8;color:#fff;font-size:12px;font-weight:600;cursor:pointer}.reply button:disabled{opacity:.6;cursor:wait}.reply [role=status]{color:#439e7f;font-size:12px}.reply [data-error=true]{color:#df687a}.pager{display:flex;gap:14px;margin-top:24px;font-size:13px}.pager a{color:#7564e8}@media(max-width:600px){.admin-page{padding:24px 16px 56px}.topbar{margin-bottom:38px}.heading{align-items:flex-start;flex-direction:column}.heading h1{font-size:27px}.comment-card{padding:18px}.reply-actions{align-items:flex-start;flex-wrap:wrap}.reply-actions .hint{flex:1 0 100%;margin:0 0 4px}}</style>`;
  const pager = `${offset ? `<a href="?offset=${Math.max(0, offset - 200)}">이전</a>` : ''}${rows.results.length === 200 ? `<a href="?offset=${offset + 200}">다음</a>` : ''}`;
  return new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>전체 댓글 · 서재 관리</title>${style}<body><main class="admin-page"><div class="topbar"><a class="brand" href="/admin/">Extransload<small>서재 관리</small></a><a class="back" href="/admin/">관리 화면으로 돌아가기</a></div><div class="heading"><div><p class="eyebrow">COMMENT MANAGEMENT</p><h1>전체 댓글</h1><p>공개·비공개 댓글을 한곳에서 확인하고 게시글에 바로 답글을 남깁니다.</p></div><span class="count">${total?.total ?? 0}개</span></div><section class="comment-list">${cards || '<p>등록된 댓글이 없습니다.</p>'}</section><nav class="pager">${pager}</nav></main>${script}</body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    },
  );
}

export async function adminCommentsJson(request: Request, env: Env) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response!;
  const url = new URL(request.url);
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
  const rows = await env.DB.prepare(
    `SELECT c.id, c.page, c.parent_id AS parentId, c.nickname, c.body, c.visibility, c.created_at AS createdAt,
    COALESCE(p.title, CASE WHEN c.page='/guestbook/' THEN '방명록' ELSE c.page END) AS postTitle
    FROM comments c LEFT JOIN posts p ON c.page='/blog/posts/' || p.slug || '/'
    ORDER BY c.created_at DESC, c.id DESC LIMIT 200 OFFSET ?`,
  )
    .bind(offset)
    .all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM comments').first<{ total: number }>();
  return json({
    items: rows.results,
    total: total?.total ?? 0,
    offset,
    next: rows.results.length === 200 ? offset + 200 : null,
    baseUrl: env.BLOG_URL ?? 'https://extransload.github.io/',
  });
}

export async function adminCommentReply(request: Request, env: Env) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response!;
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    return error('INVALID_CONTENT_TYPE', 'JSON 요청이 필요합니다.', 415);
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return error('INVALID_BODY', '입력 내용을 확인해 주세요.', 400);
  }
  if (
    !validPage(input.page) ||
    !validComment(input) ||
    !validVisibility(input.visibility) ||
    !uuid.test(String(input.parentId))
  )
    return error('INVALID_INPUT', '답글 내용을 확인해 주세요.', 422);
  const parent = await env.DB.prepare('SELECT id, page, parent_id FROM comments WHERE id=?')
    .bind(input.parentId)
    .first<{ id: string; page: string; parent_id: string | null }>();
  if (!parent || parent.page !== input.page || parent.parent_id)
    return error('INVALID_INPUT', '답글을 남길 수 없는 댓글입니다.', 422);
  const id = crypto.randomUUID();
  const salt = crypto.randomUUID();
  const now = new Date().toISOString();
  const hash = await passwordHash(crypto.randomUUID(), salt, env.COMMENTS_SECRET!);
  await env.DB.prepare(
    'INSERT INTO comments (id, page, parent_id, nickname, body, password_hash, password_salt, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, input.page, input.parentId, input.nickname, input.body, hash, salt, input.visibility, now, now)
    .run();
  return json({ id }, 201);
}

const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validPage = (value: unknown): value is string =>
  typeof value === 'string' && (value === '/guestbook/' || /^\/blog\/posts\/[^/?#\s]{1,240}\/$/.test(value));
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');

async function keyedHash(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

// Pepper stays in Worker secrets; a unique salt is stored per comment.
export async function passwordHash(password: string, salt: string, secret: string) {
  const material = await keyedHash(`password:${password}`, secret);
  const key = await crypto.subtle.importKey('raw', encoder.encode(material), 'PBKDF2', false, ['deriveBits']);
  return hex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100_000 },
      key,
      256,
    ),
  );
}

function equalHash(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

export function validComment(input: Record<string, unknown>) {
  return (
    typeof input.nickname === 'string' &&
    input.nickname.trim().length >= 1 &&
    input.nickname.trim().length <= 30 &&
    typeof input.body === 'string' &&
    input.body.trim().length >= 1 &&
    input.body.trim().length <= 3000
  );
}
const isAdministratorNickname = (value: unknown) =>
  typeof value === 'string' && ['Extransload', '관리자'].includes(value.trim().normalize('NFC'));
const reservedNickname = isAdministratorNickname;
const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 4 && value.length <= 128;
const validVisibility = (value: unknown): value is 'public' | 'private' => value === 'public' || value === 'private';

async function hasAdministratorMutationAccess(request: Request, env: Env) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return false;
  const csrf = request.headers.get('X-CSRF-Token');
  return !!csrf && (await sha256(csrf)) === auth.record.csrf_hash;
}

async function createAdministratorComment(request: Request, env: Env, input: Record<string, unknown>) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response!;
  const csrf = request.headers.get('X-CSRF-Token');
  if (!csrf || (await sha256(csrf)) !== auth.record.csrf_hash)
    return error('INVALID_CSRF', '관리자 확인이 만료되었습니다. 다시 시도해 주세요.', 403);
  if (!validPage(input.page) || !validComment({ nickname: 'Extransload', body: input.body }))
    return error('INVALID_INPUT', '댓글 내용을 확인해 주세요.', 422);
  if (input.parentId !== undefined) {
    if (!uuid.test(String(input.parentId))) return error('INVALID_INPUT', '답글 위치가 올바르지 않습니다.', 422);
    const parent = await env.DB.prepare('SELECT page, parent_id FROM comments WHERE id=?')
      .bind(input.parentId)
      .first<{ page: string; parent_id: string | null }>();
    if (!parent || parent.page !== input.page || parent.parent_id)
      return error('INVALID_INPUT', '답글을 남길 수 없는 댓글입니다.', 422);
  }
  const id = crypto.randomUUID();
  const salt = crypto.randomUUID();
  const now = new Date().toISOString();
  const hash = await passwordHash(crypto.randomUUID(), salt, env.COMMENTS_SECRET!);
  await env.DB.prepare(
    'INSERT INTO comments (id, page, parent_id, nickname, body, password_hash, password_salt, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      input.page,
      input.parentId ?? null,
      'Extransload',
      (input.body as string).trim(),
      hash,
      salt,
      'public',
      now,
      now,
    )
    .run();
  return json({ id }, 201);
}

async function rateLimit(env: Env, identity: string, scope: string, limit: number) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = await keyedHash(`${scope}:${minute}:${identity}`, env.COMMENTS_SECRET!);
  const row = await env.DB.prepare(
    `INSERT INTO comment_rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
  )
    .bind(key, (minute + 2) * 60)
    .first<{ count: number }>();
  return !!row && row.count <= limit;
}

const publicColumns = `c.id, c.page, c.parent_id AS parentId, CASE WHEN c.visibility='private' THEN NULL ELSE c.nickname END AS nickname,
  CASE WHEN c.visibility='private' THEN NULL ELSE c.body END AS body, c.visibility, c.version, c.created_at AS createdAt, c.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id=c.id) AS likes,
  EXISTS(SELECT 1 FROM comment_likes l WHERE l.comment_id=c.id AND l.visitor_hash=?) AS liked`;
const adminColumns = `c.id, c.page, c.parent_id AS parentId, c.nickname, c.body, c.visibility, c.version, c.created_at AS createdAt, c.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id=c.id) AS likes,
  EXISTS(SELECT 1 FROM comment_likes l WHERE l.comment_id=c.id AND l.visitor_hash=?) AS liked`;

async function handle(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.COMMENTS_SECRET)
    return error('COMMENTS_UNAVAILABLE', '댓글 연결을 준비하고 있습니다. 잠시 후 다시 방문해 주세요.', 503);
  const url = new URL(request.url);
  const visitor = request.headers.get('X-Comment-Visitor');
  if (visitor && !uuid.test(visitor)) return error('INVALID_VISITOR', '브라우저 식별자가 올바르지 않습니다.', 400);
  const visitorHash = visitor ? await keyedHash(`visitor:${visitor}`, env.COMMENTS_SECRET) : '';
  if (url.pathname === '/api/comments/post-like') {
    const page = url.searchParams.get('page');
    if (!validPage(page) || !page.startsWith('/blog/posts/'))
      return error('INVALID_PAGE', '글 주소를 확인해 주세요.', 400);
    if (request.method === 'PUT') {
      if (!visitor) return error('INVALID_VISITOR', '브라우저 식별자가 필요합니다.', 400);
      if (!(await rateLimit(env, request.headers.get('CF-Connecting-IP') ?? 'local', 'post-likes', 60)))
        return error('RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429);
      let input;
      try {
        input = (await request.json()) as { liked?: boolean };
      } catch {
        return error('INVALID_INPUT', '요청을 확인해 주세요.', 400);
      }
      if (!input || typeof input.liked !== 'boolean') return error('INVALID_INPUT', '요청을 확인해 주세요.', 422);
      await (
        input.liked
          ? env.DB.prepare('INSERT OR IGNORE INTO post_likes VALUES (?, ?)')
          : env.DB.prepare('DELETE FROM post_likes WHERE page=? AND visitor_hash=?')
      )
        .bind(page, visitorHash)
        .run();
    } else if (request.method !== 'GET') return error('NOT_FOUND', '경로를 확인해 주세요.', 404);
    return json(
      await env.DB.prepare(
        'SELECT COUNT(*) AS likes, EXISTS(SELECT 1 FROM post_likes WHERE page=? AND visitor_hash=?) AS liked FROM post_likes WHERE page=?',
      )
        .bind(page, visitorHash, page)
        .first(),
    );
  }
  if (url.pathname === '/api/comments' && request.method === 'GET') {
    const session = await requireSession(request, env);
    const isAdmin = 'record' in session;
    const columns = isAdmin ? adminColumns : publicColumns;
    const page = url.searchParams.get('page');
    if (!validPage(page)) return error('INVALID_PAGE', '댓글 페이지가 올바르지 않습니다.', 400);
    const after = url.searchParams.get('after');
    let cursor: { created_at: string; id: string } | null = null;
    if (after) {
      if (!uuid.test(after)) return error('INVALID_CURSOR', '목록 위치가 올바르지 않습니다.', 400);
      cursor = await env.DB.prepare('SELECT id, created_at FROM comments WHERE id=? AND page=? AND parent_id IS NULL')
        .bind(after, page)
        .first();
      if (!cursor) return error('INVALID_CURSOR', '목록이 변경되었습니다. 새로 불러와 주세요.', 409);
    }
    const rows = await env.DB.prepare(
      `SELECT ${columns} FROM comments c WHERE page=? AND c.parent_id IS NULL
      ${cursor ? 'AND (c.created_at, c.id) < (?, ?)' : ''} ORDER BY c.created_at DESC, c.id DESC LIMIT 21`,
    )
      .bind(visitorHash, page, ...(cursor ? [cursor.created_at, cursor.id] : []))
      .all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM comments WHERE page=?')
      .bind(page)
      .first<{ total: number }>();
    const roots = rows.results.slice(0, 20) as Array<{ id: string }>;
    const placeholders = roots.map(() => '?').join(', ');
    const replies = roots.length
      ? await env.DB.prepare(
          `SELECT ${columns} FROM comments c WHERE c.parent_id IN (${placeholders}) ORDER BY c.created_at ASC, c.id ASC`,
        )
          .bind(visitorHash, ...roots.map((root) => root.id))
          .all()
      : { results: [] };
    const items = [...roots, ...replies.results];
    return json({
      items,
      total: total?.total ?? 0,
      next: rows.results.length > 20 ? roots[19].id : null,
      admin: isAdmin,
    });
  }

  const administratorCreate = url.pathname === '/api/comments/admin' && request.method === 'POST';
  const match = url.pathname.match(/^\/api\/comments\/([0-9a-f-]+)(\/(like|reveal))?$/i);
  const create = url.pathname === '/api/comments' && request.method === 'POST';
  const edit = match && !match[2] && request.method === 'PATCH';
  const remove = match && !match[2] && request.method === 'DELETE';
  const like = match && match[3] === 'like' && request.method === 'PUT';
  const reveal = match && match[3] === 'reveal' && request.method === 'POST';
  if (!administratorCreate && !create && !edit && !remove && !like && !reveal)
    return error('NOT_FOUND', '댓글 경로를 찾을 수 없습니다.', 404);
  if (match && !uuid.test(match[1])) return error('INVALID_ID', '댓글 ID가 올바르지 않습니다.', 400);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    return error('INVALID_CONTENT_TYPE', 'JSON 요청이 필요합니다.', 415);
  if (Number(request.headers.get('Content-Length')) > 16_384)
    return error('TOO_LARGE', '입력 내용이 너무 깁니다.', 413);
  // Read with a hard byte limit, including chunked bodies.
  const reader = request.body?.getReader();
  if (!reader) return error('INVALID_BODY', '입력 내용을 확인해 주세요.', 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 16_384) {
      await reader.cancel();
      return error('TOO_LARGE', '입력 내용이 너무 깁니다.', 413);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
  } catch {
    return error('INVALID_BODY', '입력 내용을 확인해 주세요.', 400);
  }
  if (administratorCreate) return createAdministratorComment(request, env, input);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await rateLimit(env, ip, like ? 'likes' : create ? 'create' : 'password', like ? 60 : create ? 5 : 10))) {
    return json({ error: { code: 'RATE_LIMITED', message: '요청이 많습니다. 1분 후 다시 시도해 주세요.' } }, 429, {
      'Retry-After': '60',
    });
  }
  if (create) {
    if (
      !validPage(input.page) ||
      !validComment(input) ||
      !validPassword(input.password) ||
      !validVisibility(input.visibility)
    )
      return error(
        'INVALID_INPUT',
        '닉네임 1~30자, 댓글 1~3,000자, 비밀번호 4~128자와 공개 범위를 입력해 주세요.',
        422,
      );
    if (reservedNickname(input.nickname)) return error('RESERVED_NICKNAME', '관리자는 운영자 전용 닉네임입니다.', 422);
    if (input.website) return error('INVALID_INPUT', '등록 요청을 확인해 주세요.', 422);
    if (input.parentId !== undefined) {
      if (!uuid.test(String(input.parentId))) return error('INVALID_INPUT', '답글 위치가 올바르지 않습니다.', 422);
      const parent = await env.DB.prepare('SELECT page, parent_id FROM comments WHERE id=?')
        .bind(input.parentId)
        .first<{ page: string; parent_id: string | null }>();
      if (!parent || parent.page !== input.page || parent.parent_id)
        return error('INVALID_INPUT', '답글을 남길 수 없는 댓글입니다.', 422);
    }
    const id = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const hash = await passwordHash(input.password, salt, env.COMMENTS_SECRET);
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO comments (id, page, parent_id, nickname, body, password_hash, password_salt, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        id,
        input.page,
        input.parentId ?? null,
        (input.nickname as string).trim(),
        (input.body as string).trim(),
        hash,
        salt,
        input.visibility,
        now,
        now,
      )
      .run();
    return json({ id }, 201);
  }
  const id = match![1];
  if (like) {
    if (!visitor || typeof input.liked !== 'boolean')
      return error('INVALID_INPUT', '좋아요 요청을 확인해 주세요.', 422);
    const exists = await env.DB.prepare('SELECT id FROM comments WHERE id=?').bind(id).first();
    if (!exists) return error('NOT_FOUND', '삭제되었거나 존재하지 않는 댓글입니다.', 404);
    const change = input.liked
      ? env.DB.prepare(
          'INSERT OR IGNORE INTO comment_likes (comment_id, visitor_hash) SELECT id, ? FROM comments WHERE id=?',
        ).bind(visitorHash, id)
      : env.DB.prepare('DELETE FROM comment_likes WHERE comment_id=? AND visitor_hash=?').bind(id, visitorHash);
    const results = await env.DB.batch([
      change,
      env.DB.prepare(`SELECT ${publicColumns} FROM comments c WHERE c.id=?`).bind(visitorHash, id),
    ]);
    return results[1].results[0] ? json(results[1].results[0]) : error('NOT_FOUND', '삭제된 댓글입니다.', 404);
  }
  const stored = await env.DB.prepare(
    'SELECT password_hash, password_salt, nickname, body, visibility, version FROM comments WHERE id=?',
  )
    .bind(id)
    .first<{
      password_hash: string;
      password_salt: string;
      nickname: string;
      body: string;
      visibility: string;
      version: number;
    }>();
  if (!stored) return error('NOT_FOUND', '삭제되었거나 존재하지 않는 댓글입니다.', 404);
  const administratorMutation = (edit || remove) && (await hasAdministratorMutationAccess(request, env));
  if ((edit || remove) && reservedNickname(stored.nickname) && !administratorMutation)
    return error('ADMIN_COMMENT_FORBIDDEN', '관리자 댓글은 수정하거나 삭제할 수 없습니다.', 403);
  if (!administratorMutation && (!validPassword(input.password) || (!reveal && !Number.isInteger(input.version))))
    return error('INVALID_INPUT', '댓글 비밀번호를 입력해 주세요.', 422);
  if (edit && !validComment(input)) return error('INVALID_INPUT', '댓글 내용을 확인해 주세요.', 422);
  if (
    edit &&
    (reservedNickname(stored.nickname) ? !reservedNickname(input.nickname) : reservedNickname(input.nickname))
  )
    return error('INVALID_INPUT', '관리자 닉네임은 사용할 수 없습니다.', 422);
  if (!administratorMutation && !(await rateLimit(env, id, 'comment-password', 30)))
    return error('RATE_LIMITED', '이 댓글의 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  if (administratorMutation && !Number.isInteger(input.version))
    return error('INVALID_INPUT', '댓글 버전을 확인해 주세요.', 422);
  if (!administratorMutation) {
    const hash = await passwordHash(input.password, stored.password_salt, env.COMMENTS_SECRET);
    if (!equalHash(hash, stored.password_hash)) return error('WRONG_PASSWORD', '비밀번호가 맞지 않습니다.', 403);
  }
  if (reveal) {
    if (stored.visibility !== 'private') return error('NOT_PRIVATE', '공개 댓글입니다.', 409);
    return json({
      id,
      nickname: stored.nickname,
      body: stored.body,
      visibility: stored.visibility,
      version: stored.version,
    });
  }
  const result = remove
    ? (
        await env.DB.batch([
          env.DB.prepare(
            'DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE id=? OR parent_id=?) AND EXISTS (SELECT 1 FROM comments WHERE id=? AND version=?)',
          ).bind(id, id, id, input.version),
          env.DB.prepare(
            'DELETE FROM comments WHERE parent_id=? AND EXISTS (SELECT 1 FROM comments WHERE id=? AND version=?)',
          ).bind(id, id, input.version),
          env.DB.prepare('DELETE FROM comments WHERE id=? AND version=?').bind(id, input.version),
        ])
      )[2]
    : await env.DB.prepare(
        'UPDATE comments SET nickname=?, body=?, updated_at=?, version=version+1 WHERE id=? AND version=?',
      )
        .bind(
          (input.nickname as string).trim(),
          (input.body as string).trim(),
          new Date().toISOString(),
          id,
          input.version,
        )
        .run();
  if (!result.meta.changes)
    return error('VERSION_CONFLICT', '댓글이 변경되었습니다. 새로 불러온 뒤 다시 시도해 주세요.', 409);
  return json({ ok: true });
}

export async function commentsApi(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.COMMENTS_ORIGINS ?? 'https://extransload.github.io').split(',').map((value) => value.trim());
  if (origin && !allowed.includes(origin)) return error('ORIGIN_DENIED', '허용되지 않은 요청입니다.', 403);
  if (!origin && !['GET', 'HEAD'].includes(request.method))
    return error('ORIGIN_REQUIRED', '사이트에서 다시 시도해 주세요.', 403);
  let response: Response;
  try {
    response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await handle(request, env);
  } catch {
    response = error('COMMENTS_UNAVAILABLE', '댓글 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Comment-Visitor, X-CSRF-Token');
  }
  return new Response(response.body, { status: response.status, headers });
}
