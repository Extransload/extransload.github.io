import type { Env } from './types';
import { cookieValue, error, json, randomToken, sameOrigin, sha256 } from './security';

const SESSION_COOKIE = '__Host-admin_session';
const now = () => new Date();
const iso = (date: Date) => date.toISOString();
const b64 = (value: ArrayBuffer | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const form = (values: Record<string, string>) => new URLSearchParams(values).toString();

export async function beginGithub(request: Request, env: Env) {
  if (!env.GITHUB_CLIENT_ID) return error('ADMIN_NOT_CONFIGURED', 'GitHub OAuth가 설정되지 않았습니다.', 503);
  const state = randomToken();
  const verifier = randomToken();
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  await env.DB.prepare('INSERT INTO oauth_states (state_hash, verifier, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(state), verifier, iso(new Date(Date.now() + 600000)))
    .run();
  const callback = new URL('/auth/callback', request.url).toString();
  const location = `https://github.com/login/oauth/authorize?${form({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: callback, scope: 'read:user', state, code_challenge: challenge, code_challenge_method: 'S256' })}`;
  return Response.redirect(location, 302);
}

export async function githubCallback(request: Request, env: Env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_ALLOWED_USER_ID)
    return error('ADMIN_NOT_CONFIGURED', 'GitHub OAuth 설정이 완료되지 않았습니다.', 503);
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) return error('INVALID_OAUTH_CALLBACK', 'OAuth 응답이 올바르지 않습니다.', 400);
  const stateHash = await sha256(state);
  const stored = await env.DB.prepare('SELECT verifier, expires_at, consumed_at FROM oauth_states WHERE state_hash = ?')
    .bind(stateHash)
    .first<{ verifier: string; expires_at: string; consumed_at: string | null }>();
  if (!stored || stored.consumed_at || new Date(stored.expires_at) < now())
    return error('INVALID_OAUTH_STATE', 'OAuth 상태가 만료되었거나 이미 사용되었습니다.', 400);
  await env.DB.prepare('UPDATE oauth_states SET consumed_at = ? WHERE state_hash = ?')
    .bind(iso(now()), stateHash)
    .run();
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL('/auth/callback', request.url).toString(),
      code_verifier: stored.verifier,
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return error('OAUTH_TOKEN_FAILED', 'GitHub 토큰을 발급받지 못했습니다.', 502);
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'extransload-admin',
    },
  });
  const user = (await userResponse.json()) as { id?: number; login?: string };
  if (!user.id || String(user.id) !== env.GITHUB_ALLOWED_USER_ID)
    return error('FORBIDDEN', '허용된 관리자 계정이 아닙니다.', 403);
  const session = randomToken();
  const csrf = randomToken();
  const expires = new Date(Date.now() + 8 * 3600000);
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, github_user_id, github_login, csrf_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256(session), user.id, user.login ?? '', await sha256(csrf), iso(expires))
    .run();
  const headers = new Headers({ Location: env.BLOG_URL ?? 'https://extransload.github.io/' });
  headers.append('Set-Cookie', `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=28800`);
  return new Response(null, { status: 302, headers });
}

export async function requireSession(request: Request, env: Env) {
  const session = cookieValue(request, SESSION_COOKIE);
  if (!session) return { response: error('UNAUTHENTICATED', 'GitHub 로그인이 필요합니다.', 401) };
  const record = await env.DB.prepare(
    'SELECT token_hash, github_user_id, github_login, csrf_hash, expires_at FROM sessions WHERE token_hash = ?',
  )
    .bind(await sha256(session))
    .first<{
      token_hash: string;
      github_user_id: number;
      github_login: string;
      csrf_hash: string;
      expires_at: string;
    }>();
  if (!record || new Date(record.expires_at) <= now())
    return { response: error('UNAUTHENTICATED', '세션이 만료되었습니다.', 401) };
  if (env.GITHUB_ALLOWED_USER_ID && String(record.github_user_id) !== env.GITHUB_ALLOWED_USER_ID)
    return { response: error('FORBIDDEN', '관리자 계정이 아닙니다.', 403) };
  return { session, record };
}

export async function requireMutation(request: Request, env: Env) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth;
  if (!sameOrigin(request)) return { response: error('FORBIDDEN_ORIGIN', '허용되지 않은 요청 출처입니다.', 403) };
  const csrf = request.headers.get('X-CSRF-Token');
  if (!csrf || (await sha256(csrf)) !== auth.record.csrf_hash)
    return { response: error('INVALID_CSRF', 'CSRF 토큰이 올바르지 않습니다.', 403) };
  return auth;
}

export async function sessionResponse(request: Request, env: Env) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response;
  const csrfToken = randomToken();
  await env.DB.prepare('UPDATE sessions SET csrf_hash = ? WHERE token_hash = ?')
    .bind(await sha256(csrfToken), auth.record.token_hash)
    .run();
  return json({ user: { id: auth.record.github_user_id, login: auth.record.github_login }, csrfToken });
}

export async function logout(request: Request, env: Env) {
  const auth = await requireMutation(request, env);
  if ('response' in auth) return auth.response;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(auth.record.token_hash).run();
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0` },
  });
}
