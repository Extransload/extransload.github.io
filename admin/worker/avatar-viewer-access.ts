import type { Env } from './types';
import { requireSession } from './auth';
import { error, json } from './security';

// A read-only capability check. Unlike /api/session, this does not rotate CSRF tokens.
export async function avatarViewerAccess(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.AVATAR_VIEWER_ORIGINS ?? new URL(env.BLOG_URL ?? 'https://extransload.github.io').origin)
    .split(',')
    .map((value) => value.trim());
  if (origin && !allowedOrigins.includes(origin)) return error('ORIGIN_DENIED', '허용되지 않은 요청입니다.', 403);

  let response: Response;
  if (request.method === 'OPTIONS') {
    response = new Response(null, { status: 204 });
  } else if (request.method !== 'GET') {
    response = error('METHOD_NOT_ALLOWED', '조회 요청만 가능합니다.', 405);
  } else if (!env.DB || !env.GITHUB_ALLOWED_USER_ID) {
    response = json({ canRotateFreely: false }, 503);
  } else {
    try {
      const auth = await requireSession(request, env);
      response =
        'record' in auth && auth.record
          ? json({ canRotateFreely: true, expiresAt: auth.record.expires_at })
          : json({ canRotateFreely: false });
    } catch {
      response = json({ canRotateFreely: false }, 503);
    }
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Vary', 'Origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  return new Response(response.body, { status: response.status, headers });
}
