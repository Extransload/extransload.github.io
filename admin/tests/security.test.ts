import { describe, expect, it } from 'vitest';
import { cookieValue, sameOrigin, sha256 } from '../worker/security';

describe('worker security helpers', () => {
  it('reads only the requested cookie value', () => {
    const request = new Request('https://admin.example/admin', {
      headers: { Cookie: 'other=x; __Host-admin_session=secret' },
    });
    expect(cookieValue(request, '__Host-admin_session')).toBe('secret');
  });

  it('requires matching origin when Origin is present', () => {
    expect(
      sameOrigin(new Request('https://admin.example/api/posts', { headers: { Origin: 'https://admin.example' } })),
    ).toBe(true);
    expect(
      sameOrigin(new Request('https://admin.example/api/posts', { headers: { Origin: 'https://evil.example' } })),
    ).toBe(false);
  });

  it('hashes session material with SHA-256', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
