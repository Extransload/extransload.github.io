import { requireSession } from './auth';
import { ga4Report, searchConsoleReport } from './google';
import type { Env } from './types';
import { error, json } from './security';

const reports: Record<
  string,
  { dimensions: string[]; metrics: string[]; orderBy?: { metric: string; desc?: boolean } }
> = {
  overview: { dimensions: [], metrics: ['totalUsers', 'screenPageViews', 'sessions'] },
  trend: {
    dimensions: ['date'],
    metrics: ['totalUsers', 'screenPageViews', 'sessions'],
    orderBy: { metric: 'date', desc: false },
  },
  posts: {
    dimensions: ['pagePath'],
    metrics: ['screenPageViews', 'totalUsers'],
    orderBy: { metric: 'screenPageViews' },
  },
  sources: { dimensions: ['sessionSourceMedium'], metrics: ['sessions'], orderBy: { metric: 'sessions' } },
  countries: { dimensions: ['country', 'city'], metrics: ['totalUsers'], orderBy: { metric: 'totalUsers' } },
  devices: { dimensions: ['deviceCategory'], metrics: ['totalUsers'], orderBy: { metric: 'totalUsers' } },
};
const validDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
const previousPeriod = (start: string, end: string) => {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const previousEnd = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const previousStart = new Date(Date.parse(previousEnd) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { start: previousStart, end: previousEnd };
};

export async function analyticsReport(request: Request, env: Env, name: string) {
  const auth = await requireSession(request, env);
  if ('response' in auth) return auth.response;
  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!validDate(start) || !validDate(end) || start > end)
    return error('INVALID_PERIOD', '조회 기간이 올바르지 않습니다.', 422);
  if (name === 'search')
    return reportResponse('search-console', start, end, await searchConsoleReport(env, start, end));
  const definition = reports[name];
  if (!definition) return error('NOT_FOUND', '통계 리포트를 찾을 수 없습니다.', 404);
  try {
    const result = await ga4Report(env, {
      ...definition,
      start,
      end,
      filter: env.GA4_HOSTNAME
        ? { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: env.GA4_HOSTNAME } } }
        : undefined,
    });
    return reportResponse('ga4', start, end, result);
  } catch (cause) {
    console.error('GA4 analytics request failed', cause instanceof Error ? cause.message : 'unknown error');
    return error('ANALYTICS_UNAVAILABLE', 'GA4 통계를 조회하지 못했습니다.', 502);
  }
}
function reportResponse(source: 'ga4' | 'search-console', start: string, end: string, result: any) {
  return json({
    source,
    status: result.status,
    period: { start, end },
    previousPeriod: previousPeriod(start, end),
    stale: false,
    totals: result.totals,
    rows: result.rows,
    warnings: result.warnings,
    fetchedAt: new Date().toISOString(),
  });
}
