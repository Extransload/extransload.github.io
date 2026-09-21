import { expect, it, vi } from 'vitest';
import { ga4Report } from '../worker/google';
import type { Env } from '../worker/types';

it('reads overview rows and sends date sorting as a dimension', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const env = {
    GA4_PROPERTY_ID: '123',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.invalid',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: btoa(String.fromCharCode(...new Uint8Array(der))),
  } as Env;
  const requests: any[] = [];
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('oauth2')) return Response.json({ access_token: 'test-token' });
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({
      metricHeaders: [{ name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
      rows: [{ metricValues: [{ value: '3' }, { value: '9' }, { value: '4' }] }],
    });
  });
  try {
    const request = {
      dimensions: [],
      metrics: ['totalUsers', 'screenPageViews', 'sessions'],
      start: '2026-09-01',
      end: '2026-09-08',
    };
    const report = await ga4Report(env, request);
    expect(report.totals).toEqual({ totalUsers: 3, screenPageViews: 9, sessions: 4 });
    await ga4Report(env, { ...request, dimensions: ['date'], orderBy: { metric: 'date', desc: false } });
    expect(requests[1].orderBys).toEqual([{ dimension: { dimensionName: 'date' }, desc: false }]);
  } finally {
    mock.mockRestore();
  }
});
