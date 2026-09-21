import type { Env } from './types';

const b64url = (value: ArrayBuffer | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let output = '';
  for (const byte of bytes) output += String.fromCharCode(byte);
  return btoa(output).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const derFromPem = (pem: string) => {
  const normalized = pem.replaceAll('\\n', '\n').replaceAll('\\r', '\r');
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function serviceAccountToken(env: Env, scope: string) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    throw new Error('Google service account is not configured');
  const issued = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: issued,
      exp: issued + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    derFromPem(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  const result = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !result.access_token)
    throw new Error(
      `Google token request failed (${response.status}): ${result.error_description ?? result.error ?? 'unknown error'}`,
    );
  return result.access_token;
}

export async function ga4Report(
  env: Env,
  request: {
    dimensions: string[];
    metrics: string[];
    start: string;
    end: string;
    filter?: unknown;
    orderBy?: { metric: string; desc?: boolean };
  },
) {
  if (!env.GA4_PROPERTY_ID)
    return {
      status: 'unconfigured' as const,
      rows: [],
      totals: {},
      warnings: ['GA4 property ID가 설정되지 않았습니다.'],
    };
  const token = await serviceAccountToken(env, 'https://www.googleapis.com/auth/analytics.readonly');
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: request.start, endDate: request.end }],
    dimensions: request.dimensions.map((name) => ({ name })),
    metrics: request.metrics.map((name) => ({ name })),
    limit: 100,
  };
  if (request.filter) body.dimensionFilter = request.filter;
  if (request.orderBy)
    body.orderBys = [
      {
        ...(request.dimensions.includes(request.orderBy.metric)
          ? { dimension: { dimensionName: request.orderBy.metric } }
          : { metric: { metricName: request.orderBy.metric } }),
        desc: request.orderBy.desc ?? true,
      },
    ];
  if (request.dimensions.includes('date')) body.limit = 10000;
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(env.GA4_PROPERTY_ID)}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const result = (await response.json()) as any;
  if (!response.ok)
    throw new Error(`GA4 report failed (${response.status}): ${result.error?.message ?? 'unknown error'}`);
  const rows = (result.rows ?? []).map((row: any) =>
    Object.fromEntries(
      (result.dimensionHeaders ?? [])
        .map((header: any, index: number) => [header.name, row.dimensionValues?.[index]?.value ?? ''])
        .concat(
          (result.metricHeaders ?? []).map((header: any, index: number) => [
            header.name,
            Number(row.metricValues?.[index]?.value ?? 0),
          ]),
        ),
    ),
  );
  // A report without dimensions returns its period-wide values in the first row.
  // Never sum per-page users: a person can visit more than one page.
  const totalRow = request.dimensions.length === 0 ? result.rows?.[0] : result.totals?.[0];
  const totals = Object.fromEntries(
    request.metrics.map((name, index) => [name, Number(totalRow?.metricValues?.[index]?.value ?? 0)]),
  );
  return {
    status: 'ok' as const,
    rows,
    totals,
    warnings: result.metadata?.samplingMetadatas ? ['GA4 응답에 샘플링 정보가 포함되어 있습니다.'] : [],
  };
}

export async function searchConsoleReport(env: Env, start: string, end: string) {
  if (!env.SEARCH_CONSOLE_PROPERTY)
    return {
      status: 'unconfigured' as const,
      rows: [],
      totals: {},
      warnings: ['Search Console 속성이 설정되지 않았습니다.'],
    };
  const token = await serviceAccountToken(env, 'https://www.googleapis.com/auth/webmasters.readonly');
  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.SEARCH_CONSOLE_PROPERTY)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 50 }),
    },
  );
  const result = (await response.json()) as any;
  if (!response.ok)
    throw new Error(`Search Console report failed (${response.status}): ${result.error?.message ?? 'unknown error'}`);
  return {
    status: 'ok' as const,
    rows: (result.rows ?? []).map((row: any) => ({
      query: row.keys?.[0] ?? '',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    })),
    totals: {},
    warnings: [],
  };
}
