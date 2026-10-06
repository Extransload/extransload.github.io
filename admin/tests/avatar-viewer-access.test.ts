import { describe, expect, it, vi } from 'vitest';
import { avatarViewerAccess } from '../worker/avatar-viewer-access';
import type { Env } from '../worker/types';

const origin = 'http://127.0.0.1:48765';
const future = () => new Date(Date.now() + 3_600_000).toISOString();
function fixture(record: unknown = null) {
  const first = vi.fn().mockResolvedValue(record);
  const run = vi.fn();
  const prepare = vi.fn((_sql: string) => ({ bind: vi.fn(() => ({ first, run })) }));
  const env = {
    DB: { prepare },
    GITHUB_ALLOWED_USER_ID: '42',
    AVATAR_VIEWER_ORIGINS: `https://extransload.github.io,${origin}`,
  } as unknown as Env;
  return { env, first, run, prepare };
}
const request = (cookie = '', requestOrigin = origin, method = 'GET') =>
  new Request('https://admin.example/api/avatar-viewer/access', {
    method,
    headers: { Origin: requestOrigin, ...(cookie ? { Cookie: `__Host-admin_session=${cookie}` } : {}) },
  });

describe('avatar viewer administrator capability', () => {
  it('keeps anonymous visitors restricted without querying sessions', async () => {
    const { env, prepare } = fixture();
    const response = await avatarViewerAccess(request(), env);
    expect(await response.json()).toEqual({ canRotateFreely: false });
    expect(prepare).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('grants only the configured GitHub administrator and does not mutate the session', async () => {
    const expiresAt = future();
    const { env, run, prepare } = fixture({ github_user_id: 42, expires_at: expiresAt });
    const response = await avatarViewerAccess(request('valid-session'), env);
    expect(await response.json()).toEqual({ canRotateFreely: true, expiresAt });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][0]).toMatch(/^SELECT /);
    expect(run).not.toHaveBeenCalled();
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it.each([
    ['unknown session', null],
    ['expired session', { github_user_id: 42, expires_at: '2000-01-01T00:00:00Z' }],
    ['different GitHub user', { github_user_id: 7, expires_at: future() }],
  ])('denies %s', async (_name, record) => {
    const { env } = fixture(record);
    expect(await (await avatarViewerAccess(request('session'), env)).json()).toEqual({ canRotateFreely: false });
  });

  it('does not grant access when administrator configuration or the database is unavailable', async () => {
    const { env, first } = fixture({ github_user_id: 42, expires_at: future() });
    first.mockRejectedValue(new Error('database unavailable'));
    expect((await avatarViewerAccess(request('session'), env)).status).toBe(503);
    env.GITHUB_ALLOWED_USER_ID = undefined;
    expect(await (await avatarViewerAccess(request('session'), env)).json()).toEqual({ canRotateFreely: false });
  });

  it('rejects unlisted origins before accessing the database', async () => {
    const { env, prepare } = fixture();
    const response = await avatarViewerAccess(request('session', 'https://untrusted.example'), env);
    expect(response.status).toBe(403);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('allows only read requests and their preflight', async () => {
    const { env, prepare } = fixture();
    expect((await avatarViewerAccess(request('', origin, 'OPTIONS'), env)).status).toBe(204);
    expect((await avatarViewerAccess(request('', origin, 'POST'), env)).status).toBe(405);
    expect(prepare).not.toHaveBeenCalled();
  });
});
