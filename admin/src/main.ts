import { api } from './api';
import type { Post, ReportResponse } from './contracts';
import './styles.css';
import './chart-interaction.css';
import { calendarDate, rollingPeriod, dailyRows } from './rolling';
import { enhanceControls } from './controls';
import './workspace-ui.css';
import './exit.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML =
  '<main class="login"><p class="eyebrow">PRIVATE ARCHIVE</p><h1>관리자 연결 확인 중</h1><p>GitHub 로그인 상태를 확인하고 있습니다.</p></main>';
let csrfToken = '';
let activePost: Post | undefined;
let saveInFlight: Promise<void> | undefined;
let cancelEditorTimer = () => {};
let editorDirty = false;
let currentView = 'analytics';
let theme = (localStorage.getItem('extransload-admin-theme') as 'light' | 'dark' | null) ?? 'light';
document.documentElement.dataset.theme = theme;

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const today = calendarDate(new Date());
let periodDays: number | null = 30;
let selectedPeriod = rollingPeriod(30);
let analyticsRequest = 0;
let analyticsBusy = false;
let analyticsFetched = 0;
let chartMetric = 'screenPageViews';
let chartSelection = 0;
let chartInteractionAt = 0;
let periodEditing = false;
const analyticsNames = ['overview', 'trend', 'posts', 'sources', 'countries', 'devices', 'search'];
const analyticsTitles: Record<string, string> = {
  overview: '요약',
  trend: '일별 추이',
  posts: '인기 페이지',
  sources: '유입 경로',
  countries: '지역',
  devices: '기기',
  search: '검색어',
};

function shell(content: string, background = false) {
  if (background && document.querySelector('.report-grid')) {
    const template = document.createElement('template');
    template.innerHTML = content;
    for (const selector of ['.metrics', '.report-grid'])
      document.querySelector(selector)!.replaceWith(template.content.querySelector(selector)!);
    return;
  }
  app.innerHTML = `<main class="admin-shell"><header><a href="/" class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3l2.8 8.2L27 14l-8.2 2.8L16 25l-2.8-8.2L5 14l8.2-2.8L16 3Z" fill="currentColor"/><circle cx="16" cy="14" r="3.2" fill="white"/></svg></span><span>Extransload<small>서재 관리</small></span></a><nav><button data-view="analytics">통계</button><button data-view="posts">글 관리</button><button data-view="editor">새 글</button><button data-view="comments">전체 댓글</button><button id="theme-toggle" type="button" aria-label="테마 변경">${theme === 'light' ? '☾ 다크 모드' : '☀ 라이트 모드'}</button><button id="logout">로그아웃</button></nav><a class="exit" href="https://extransload.github.io/" aria-label="공개 사이트로 나가기">Exit</a></header><section id="content">${content}</section></main>`;
  document
    .querySelectorAll<HTMLButtonElement>('[data-view]')
    .forEach((button) => (button.onclick = () => void renderView(button.dataset.view!)));
  document.querySelector(`nav [data-view="${currentView}"]`)?.classList.add('active');
  document.querySelector<HTMLButtonElement>('#theme-toggle')!.onclick = () => {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('extransload-admin-theme', theme);
    document.documentElement.dataset.theme = theme;
    document.querySelector('#theme-toggle')!.textContent = theme === 'light' ? '☾ 다크 모드' : '☀ 라이트 모드';
  };
  document.querySelector<HTMLButtonElement>('#logout')!.onclick = async () => {
    if (!(await flushEditor())) return;
    await api.logout(csrfToken);
    location.reload();
  };
}

const postFilters = { query: '', category: 'all', status: 'all', sort: 'updated' };
const collapsedCategories = new Set<string>();

async function renderPosts() {
  cancelEditorTimer();
  currentView = 'posts';
  const result = await api.posts();
  const categories = [...new Set(result.items.map((post) => post.category))].sort((a, b) => a.localeCompare(b, 'ko'));
  shell(
    `<div class="page-heading"><div><p class="eyebrow">MANUSCRIPTS</p><h1>글 관리</h1><p class="muted">카테고리별로 글을 찾아 편집하세요.</p></div><div class="page-actions"><button class="secondary" id="import-posts">GitHub에서 동기화</button><button class="primary" data-view="editor">새 글 쓰기</button></div></div><div class="post-tools"><input id="post-search" aria-label="글 검색" placeholder="제목·설명·태그 검색" value="${escape(postFilters.query)}"><select id="post-category" aria-label="카테고리"><option value="all">모든 카테고리</option>${categories.map((category) => `<option value="${escape(category)}">${escape(category)}</option>`).join('')}</select><select id="post-filter" aria-label="공개 상태"><option value="all">모든 상태</option><option value="published">공개 전체</option><option value="draft">초안</option><option value="published_with_draft">공개 · 수정본</option></select><select id="post-sort" aria-label="정렬"><option value="updated">최근 수정순</option><option value="published">발행일 최신순</option><option value="oldest">발행일 오래된순</option><option value="title">제목순</option></select></div><p id="post-summary" class="muted" role="status"></p><p id="sync-status" role="status"></p><div id="post-groups"></div>`,
  );
  const search = document.querySelector<HTMLInputElement>('#post-search')!;
  const category = document.querySelector<HTMLSelectElement>('#post-category')!;
  const status = document.querySelector<HTMLSelectElement>('#post-filter')!;
  const sort = document.querySelector<HTMLSelectElement>('#post-sort')!;
  if (!categories.includes(postFilters.category)) postFilters.category = 'all';
  category.value = postFilters.category;
  status.value = postFilters.status;
  sort.value = postFilters.sort;
  const draw = () => {
    Object.assign(postFilters, {
      query: search.value,
      category: category.value,
      status: status.value,
      sort: sort.value,
    });
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = result.items
      .filter(
        (post) =>
          (!query ||
            [post.title, post.description, post.category, ...post.tags]
              .join(' ')
              .toLocaleLowerCase()
              .includes(query)) &&
          (category.value === 'all' || post.category === category.value) &&
          (status.value === 'all' ||
            (status.value === 'published' ? post.desiredVisibility === 'published' : post.status === status.value)),
      )
      .sort((a, b) => {
        if (sort.value === 'title') return a.title.localeCompare(b.title, 'ko');
        const date = (p: Post) => Date.parse(sort.value === 'updated' ? p.updatedAt : p.pubDate) || 0;
        return (
          (sort.value === 'oldest' ? date(a) - date(b) : date(b) - date(a)) || a.title.localeCompare(b.title, 'ko')
        );
      });
    document.querySelector('#post-summary')!.textContent =
      `전체 ${result.items.length}개 중 ${filtered.length}개 · 카테고리 안에서 정렬됩니다`;
    const groups = document.querySelector('#post-groups')!;
    groups.innerHTML =
      categories
        .map((name) => {
          const posts = filtered.filter((post) => post.category === name);
          if (!posts.length) return '';
          return `<details class="post-group" data-category="${escape(name)}" ${collapsedCategories.has(name) ? '' : 'open'}><summary><span>${escape(name)}</span><span class="group-count">${posts.length}</span></summary><div class="post-list">${posts.map((post) => `<button class="post-row" data-post="${escape(post.id)}"><span><strong>${escape(post.title)}</strong><small>${sort.value === 'updated' ? '수정' : '발행'} ${escape((sort.value === 'updated' ? post.updatedAt : post.pubDate).slice(0, 10))}</small></span><em class="status ${post.status}">${post.status === 'draft' ? '초안' : post.status === 'published_with_draft' ? '공개 · 수정본' : '공개'}</em></button>`).join('')}</div></details>`;
        })
        .join('') || '<p class="empty">조건에 맞는 글이 없습니다. 검색어나 필터를 변경해 주세요.</p>';
    groups.querySelectorAll<HTMLDetailsElement>('details').forEach((group) =>
      group.addEventListener('toggle', () => {
        if (!group.isConnected) return;
        if (group.open) collapsedCategories.delete(group.dataset.category!);
        else collapsedCategories.add(group.dataset.category!);
      }),
    );
    groups.querySelectorAll<HTMLButtonElement>('[data-post]').forEach(
      (button) =>
        (button.onclick = async () => {
          try {
            renderEditor(await api.post(button.dataset.post!));
          } catch (error) {
            document.querySelector('#sync-status')!.textContent =
              error instanceof Error ? error.message : '글을 불러오지 못했습니다.';
          }
        }),
    );
  };
  search.addEventListener('input', draw);
  for (const select of [category, status, sort]) select.addEventListener('input', draw);
  draw();
  enhanceControls(document.querySelector('#content')!);
  const importButton = document.querySelector<HTMLButtonElement>('#import-posts')!;
  importButton.onclick = async () => {
    importButton.disabled = true;
    importButton.textContent = '동기화 중…';
    try {
      const sync = await api.importPosts(csrfToken);
      await renderPosts();
      document.querySelector('#sync-status')!.textContent =
        `가져옴 ${sync.imported}개 · 기존 유지 ${sync.unchanged}개 · 실패 ${sync.failed ?? 0}개`;
    } catch (error) {
      importButton.disabled = false;
      importButton.textContent = 'GitHub에서 동기화';
      document.querySelector('#sync-status')!.textContent = error instanceof Error ? error.message : '동기화 실패';
    }
  };
}

async function renderComments() {
  if (!(await flushEditor())) return;
  currentView = 'comments';
  const result = await api.comments();
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  shell(
    `<div class="page-heading"><div><p class="eyebrow">COMMENT MANAGEMENT</p><h1>전체 댓글</h1><p class="muted">댓글을 확인하고 해당 글에서 바로 이어서 관리하세요.</p></div><a class="secondary link-button" href="${escape(result.baseUrl)}" target="_blank" rel="noopener">사이트 열기</a></div><p class="comment-admin-summary">전체 ${result.total}개</p><section class="comment-admin-list" aria-label="전체 댓글 목록">${result.items.map((item) => `<article class="comment-admin-row"><div class="comment-admin-row__body"><p class="comment-admin-body">${escape(item.body)}</p><div class="comment-admin-context"><a href="${escape(result.baseUrl.replace(/\/$/, '') + item.page)}" target="_blank" rel="noopener">${escape(item.postTitle)}</a><span class="comment-admin-badge comment-admin-badge--${item.visibility}">${item.visibility === 'private' ? '비공개' : '공개'}</span>${item.parentId ? '<span class="comment-admin-reply">대댓글</span>' : ''}</div></div><div class="comment-admin-row__meta"><strong>${escape(item.nickname)}</strong><time>${escape(formatDate(item.createdAt))}</time></div></article>`).join('') || '<p class="empty">등록된 댓글이 없습니다.</p>'}</section>`,
  );
}

async function renderAnalytics(start?: string, end?: string, background = false) {
  if (!background) periodEditing = false;
  const restoreChartFocus = background && document.activeElement?.matches('.trend-chart svg');
  if (start && end) selectedPeriod = { start, end };
  else if (periodDays) selectedPeriod = rollingPeriod(periodDays);
  ({ start, end } = selectedPeriod);
  currentView = 'analytics';
  const requestId = ++analyticsRequest;
  analyticsBusy = true;
  const reports = await Promise.allSettled(analyticsNames.map((name) => api.report(name, start, end)));
  if (requestId !== analyticsRequest || currentView !== 'analytics') return;
  analyticsBusy = false;
  analyticsFetched = Date.now();
  if (reports[1].status === 'fulfilled' && reports[1].value.status === 'ok')
    reports[1].value.rows = dailyRows(reports[1].value.rows, start, end);
  const overview = reports[0].status === 'fulfilled' ? reports[0].value : undefined;
  const cards = ['totalUsers', 'screenPageViews', 'sessions']
    .map(
      (key) =>
        `<article class="metric"><span>${key === 'totalUsers' ? '방문자' : key === 'screenPageViews' ? '페이지뷰' : '세션'}</span><strong>${overview?.totals[key] ?? '—'}</strong></article>`,
    )
    .join('');
  shell(
    `<div class="page-heading"><div><p class="eyebrow">OBSERVATORY</p><h1>사이트 통계</h1><p class="muted">GA4 및 Search Console 데이터를 한눈에 확인합니다.</p></div><div class="analytics-controls"><select id="period-preset"><option value="30">최근 30일</option><option value="7">최근 7일</option><option value="90">최근 90일</option><option value="365">최근 1년</option><option value="custom">직접 선택</option></select><input id="period-start" type="date" value="${start}"><span>—</span><input id="period-end" type="date" value="${end}"><button class="primary" id="period-apply">조회</button></div></div><div class="metrics">${cards}</div><div class="report-grid">${reports
      .map((result, index) => {
        const name = analyticsNames[index];
        if (result.status === 'rejected')
          return `<article class="panel"><h2>${analyticsTitles[name]}</h2><p class="muted">통계를 불러오지 못했습니다.</p></article>`;
        return reportPanel(name, result.value);
      })
      .join('')}</div>`,
    background,
  );
  const preset = document.querySelector('#period-preset') as unknown as HTMLSelectElement;
  const trend = reports[1];
  if (trend.status === 'fulfilled') bindTrendInteraction(trend.value.rows);
  if (restoreChartFocus) document.querySelector<SVGElement>('.trend-chart svg')?.focus();
  const startInput = document.querySelector('#period-start') as unknown as HTMLInputElement;
  const endInput = document.querySelector('#period-end') as unknown as HTMLInputElement;
  startInput.value = start;
  endInput.value = end;
  preset.value = periodDays ? String(periodDays) : 'custom';
  preset.dispatchEvent(new Event('change'));
  preset.onchange = () => {
    if (preset.value !== 'custom') {
      const range = rollingPeriod(Number(preset.value));
      startInput.value = range.start;
      endInput.value = range.end;
    }
  };
  [startInput, endInput].forEach(
    (input) =>
      (input.oninput = () => {
        input.setCustomValidity('');
        preset.value = 'custom';
        preset.dispatchEvent(new Event('change'));
      }),
  );
  document.querySelector<HTMLButtonElement>('#period-apply')!.onclick = () => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startInput.value) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endInput.value) ||
      !Number.isFinite(Date.parse(startInput.value)) ||
      !Number.isFinite(Date.parse(endInput.value)) ||
      startInput.value > endInput.value ||
      (Date.parse(endInput.value) - Date.parse(startInput.value)) / 86400000 > 365
    ) {
      startInput.setCustomValidity('날짜를 YYYY-MM-DD 형식으로 입력해주세요. 조회 범위는 최대 366일입니다.');
      startInput.reportValidity();
      return;
    }
    startInput.setCustomValidity('');
    periodDays = preset.value === 'custom' ? null : Number(preset.value);
    void renderAnalytics(startInput.value, endInput.value);
  };
  document.querySelector('.page-heading .muted')!.textContent =
    `5분마다 자동 조회 · 마지막 조회 ${new Date().toLocaleTimeString('ko-KR')} · GA4 집계 지연으로 최신 방문이 아직 없을 수 있습니다.`;
  enhanceControls(document.querySelector('#content')!);
}

document.addEventListener('input', (event) => {
  if ((event.target as HTMLElement)?.closest('.analytics-controls')) periodEditing = true;
});
window.setInterval(() => {
  if (currentView !== 'analytics' || document.hidden || analyticsBusy || Date.now() - analyticsFetched < 300000) return;
  if (periodEditing || document.querySelector('.control-dialog') || Date.now() - chartInteractionAt < 30000) return;
  void renderAnalytics(undefined, undefined, true);
}, 15000);

function reportPanel(name: string, report: ReportResponse) {
  const title = analyticsTitles[name];
  const status = `<span class="source ${report.status}">${report.status === 'ok' ? '연결됨' : report.status === 'unconfigured' ? '설정 필요' : '조회 불가'}</span>`;
  if (name === 'overview' && report.status === 'ok')
    return `<article class="panel"><div class="panel-heading"><h2>${title}</h2>${status}</div><div class="overview-list">${Object.entries(
      report.totals,
    )
      .map(
        ([key, value]) =>
          `<div><span>${key === 'totalUsers' ? '방문자' : key === 'screenPageViews' ? '페이지뷰' : key}</span><strong>${value.toLocaleString()}</strong></div>`,
      )
      .join('')}</div></article>`;
  if (!report.rows.length)
    return `<article class="panel"><div class="panel-heading"><h2>${title}</h2>${status}</div><p class="muted">${report.warnings[0] ?? '수집된 데이터가 없습니다.'}</p></article>`;
  if (name === 'trend')
    return `<article class="panel trend-panel"><div class="panel-heading"><div><h2>${title}</h2><p class="muted">페이지뷰와 방문자 흐름</p></div>${status}</div>${trendChart(report.rows)}</article>`;
  const keys = Object.keys(report.rows[0]);
  const labels: Record<string, string> = {
    pagePath: '페이지',
    screenPageViews: '페이지뷰',
    totalUsers: '방문자',
    sessions: '세션',
    sessionSourceMedium: '유입 경로',
    country: '국가',
    city: '도시',
    deviceCategory: '기기',
    query: '검색어',
    clicks: '클릭',
    impressions: '노출',
    ctr: 'CTR',
    position: '평균 순위',
    date: '날짜',
  };
  const body = report.rows
    .slice(0, 20)
    .map((row) => `<tr>${keys.map((key) => `<td>${escape(String(row[key]))}</td>`).join('')}</tr>`)
    .join('');
  return `<article class="panel"><div class="panel-heading"><h2>${title}</h2>${status}</div><table><thead><tr>${keys.map((key) => `<th>${labels[key] ?? key}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></article>`;
}

function trendChart(rows: Array<Record<string, string | number>>) {
  const names: Record<string, string> = { screenPageViews: '페이지뷰', totalUsers: '방문자', sessions: '세션' };
  const max = Math.max(...rows.map((row) => Number(row[chartMetric] ?? 0)), 1);
  const ceiling = Math.ceil(max / 4) * 4;
  const x = (index: number) => 48 + (index / Math.max(rows.length - 1, 1)) * 728;
  const y = (value: number) => 200 - (value / ceiling) * 176;
  const segments: string[] = [];
  let previous = false;
  rows.forEach((row, index) => {
    const present = row[chartMetric] !== undefined;
    if (present) segments.push(`${previous ? 'L' : 'M'}${x(index)},${y(Number(row[chartMetric]))}`);
    previous = present;
  });
  return `<div class="chart-switch" role="group" aria-label="그래프 지표">${Object.entries(names)
    .map(
      ([key, label]) =>
        `<button type="button" data-metric="${key}" aria-pressed="${key === chartMetric}">${label}</button>`,
    )
    .join(
      '',
    )}</div><div class="trend-chart"><svg viewBox="0 0 800 240" role="img" aria-label="일별 ${names[chartMetric]}" preserveAspectRatio="none">${Array.from({ length: 5 }, (_, i) => `<line x1="48" x2="776" y1="${24 + i * 44}" y2="${24 + i * 44}"/><text x="38" y="${28 + i * 44}" text-anchor="end">${((ceiling * (4 - i)) / 4).toLocaleString()}</text>`).join('')}<path d="${segments.join(' ')}" fill="none" stroke="#8874ee" stroke-width="3" vector-effect="non-scaling-stroke"/>${rows.map((row, index) => (row[chartMetric] === undefined ? '' : `<circle cx="${x(index)}" cy="${y(Number(row[chartMetric]))}" r="${rows.length <= 31 ? 3 : 1.5}"/ >`.replace('/ >', '/>'))).join('')}${rows.map((row, index) => (index === 0 || index === rows.length - 1 || index === Math.floor((rows.length - 1) / 2) ? `<text x="${x(index)}" y="228" text-anchor="${index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}">${escape(String(row.date).slice(5).replace('-', '/'))}</text>` : '')).join('')}</svg><p class="muted chart-note">${names[chartMetric]} · 빈 구간은 응답 데이터 없음 · 오늘 수치는 집계 중</p></div>`;
}

function bindTrendInteraction(rows: Array<Record<string, string | number>>) {
  const panelHeading = document.querySelector('.trend-panel .panel-heading');
  if (panelHeading && !panelHeading.querySelector('.analytics-link'))
    panelHeading.insertAdjacentHTML(
      'beforeend',
      '<a class="analytics-link" href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Google Analytics <span aria-hidden="true">↗</span><span class="sr-only"> (새 탭)</span></a>',
    );
  document.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach(
    (button) =>
      (button.onclick = () => {
        chartMetric = button.dataset.metric!;
        const panel = button.closest('.trend-panel')!;
        panel.querySelector('.chart-switch')?.remove();
        panel.querySelector('.trend-chart')?.remove();
        panel.insertAdjacentHTML('beforeend', trendChart(rows));
        bindTrendInteraction(rows);
      }),
  );
  const chart = document.querySelector<HTMLElement>('.trend-chart');
  const svg = chart?.querySelector('svg');
  if (!chart || !svg || !rows.length) return;
  svg.querySelector('path')?.remove();
  svg.querySelectorAll('circle').forEach((circle) => circle.remove());
  const ceiling = Math.ceil(Math.max(...rows.map((row) => Number(row[chartMetric] ?? 0)), 1) / 4) * 4;
  const present = rows.filter((row) => row[chartMetric] !== undefined).length;
  chart.insertAdjacentHTML(
    'afterbegin',
    `<p class="trend-summary">${present ? `${rows.length}일 중 <strong>${present}일</strong>의 데이터가 있어요` : '조회된 데이터가 아직 없어요'}</p>`,
  );
  const note = chart.querySelector('.chart-note');
  if (note) note.textContent = '빈 날짜는 조회된 데이터 없음 · 0은 기준선에 표시 · 오늘 수치는 집계 중';
  rows.forEach((row, index) => {
    if (row[chartMetric] === undefined) return;
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const height = Math.max(2, (Number(row[chartMetric]) / ceiling) * 176);
    bar.setAttribute('class', 'trend-bar');
    bar.dataset.index = String(index);
    bar.setAttribute('y', String(200 - height));
    bar.setAttribute('height', String(height));
    bar.setAttribute('rx', '3');
    svg.appendChild(bar);
  });
  let plotWidth = 800;
  const layout = () => {
    plotWidth = svg.getBoundingClientRect().width || 800;
    const remap = (x: number) => 38 + ((x - 48) / 728) * (plotWidth - 50);
    svg.setAttribute('viewBox', `0 0 ${plotWidth} 240`);
    svg.querySelectorAll<SVGRectElement>('.trend-bar').forEach((bar) => {
      const slot = (plotWidth - 50) / rows.length;
      const width = Math.min(32, Math.max(1, slot * 0.65));
      bar.setAttribute('x', String(38 + (Number(bar.dataset.index) + 0.5) * slot - width / 2));
      bar.setAttribute('width', String(width));
    });
    svg.querySelectorAll<SVGElement>('line:not(.trend-guide), circle, text').forEach((node) => {
      for (const attribute of ['x', 'x1', 'x2', 'cx']) {
        const value = node.getAttribute(attribute);
        if (value === null) continue;
        const key = `original${attribute}`;
        node.dataset[key] ??= value;
        node.setAttribute(attribute, String(remap(Number(node.dataset[key]))));
      }
    });
    const path = svg.querySelector('path');
    if (path) {
      path.dataset.original ??= path.getAttribute('d') ?? '';
      path.setAttribute(
        'd',
        path.dataset.original.replace(/([ML])([\d.]+),/g, (_, command, x) => `${command}${remap(Number(x))},`),
      );
    }
  };
  layout();
  const resize = new ResizeObserver(() => {
    if (!svg.isConnected) resize.disconnect();
    else layout();
  });
  resize.observe(svg);
  const tooltip = document.createElement('div');
  tooltip.className = 'trend-tooltip';
  tooltip.id = 'trend-tooltip';
  tooltip.setAttribute('role', 'status');
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.hidden = true;
  chart.appendChild(tooltip);
  svg.setAttribute('tabindex', '0');
  svg.setAttribute(
    'aria-label',
    `일별 ${chartMetric === 'screenPageViews' ? '페이지뷰' : chartMetric === 'totalUsers' ? '방문자' : '세션'} 막대그래프. 좌우 방향키로 날짜를 선택하고 Escape로 닫습니다.`,
  );
  svg.setAttribute('aria-describedby', tooltip.id);
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  guide.setAttribute('class', 'trend-guide');
  guide.setAttribute('y1', '0');
  guide.setAttribute('y2', '230');
  guide.style.display = 'none';
  svg.appendChild(guide);
  let selected = chartSelection;
  const show = (index: number) => {
    selected = Math.max(0, Math.min(rows.length - 1, index));
    chartSelection = selected;
    const row = rows[selected];
    const date = String(row.date ?? '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    const metrics = [
      ['screenPageViews', '페이지뷰'],
      ['totalUsers', '방문자'],
      ['sessions', '세션'],
    ];
    const hasValues = metrics.some(([key]) => row[key] !== undefined);
    tooltip.innerHTML = `<strong>${escape(date.slice(5).replace('-', '월 '))}일</strong>${hasValues ? metrics.map(([key, label]) => `<div class="${key === chartMetric ? 'selected-metric' : ''}"><span>${label}</span><b>${row[key] === undefined ? '—' : Number(row[key]).toLocaleString()}</b></div>`).join('') : '<span class="trend-empty">조회된 데이터 없음</span>'}`;
    tooltip.hidden = false;
    const ratio = (selected + 0.5) / rows.length;
    const x = 38 + ratio * (plotWidth - 50);
    const desired = x - tooltip.offsetWidth / 2;
    tooltip.style.left = `${Math.max(0, Math.min(chart.clientWidth - tooltip.offsetWidth, desired))}px`;
    guide.setAttribute('x1', String(x));
    guide.setAttribute('x2', String(x));
    guide.style.display = '';
    svg
      .querySelectorAll<SVGRectElement>('.trend-bar')
      .forEach((bar) => bar.classList.toggle('selected-point', Number(bar.dataset.index) === selected));
  };
  const hide = () => {
    tooltip.hidden = true;
    guide.style.display = 'none';
    svg.querySelectorAll('.selected-point').forEach((circle) => circle.classList.remove('selected-point'));
  };
  const point = (event: PointerEvent) => {
    chartInteractionAt = Date.now();
    const rect = svg.getBoundingClientRect();
    show(Math.floor(((event.clientX - rect.left - 38) / (plotWidth - 50)) * rows.length));
  };
  svg.addEventListener('pointermove', point);
  svg.addEventListener('pointerdown', point);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(selected));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (event) => {
    chartInteractionAt = Date.now();
    if (event.key === 'Escape') hide();
    else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      show(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? rows.length - 1
            : selected + (event.key === 'ArrowRight' ? 1 : -1),
      );
    }
  });
}

function renderEditor(post?: Post) {
  cancelEditorTimer();
  editorDirty = false;
  currentView = 'editor';
  activePost = post;
  const value: Post = post ?? {
    id: '',
    slug: '',
    title: '',
    description: '',
    pubDate: today,
    category: 'Study',
    tags: [],
    body: '',
    version: 0,
    desiredVisibility: 'draft',
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };
  shell(
    `<div class="page-heading"><div><p class="eyebrow">WRITING DESK</p><h1>${post ? '글 수정' : '새 글'}</h1></div><span id="save-status" class="muted">저장되지 않음</span></div><form id="editor-form" class="editor"><label>제목<input name="title" required value="${escape(value.title)}"></label><label>설명<input name="description" value="${escape(value.description)}"></label><div class="form-row"><label>발행일<input name="pubDate" type="date" value="${value.pubDate.slice(0, 10)}"></label><label>카테고리<select name="category">${['Git', '일상', 'project', 'Study', 'MacOS', 'Algorithm', 'Library', 'uncategorized'].map((category) => `<option ${category === value.category ? 'selected' : ''}>${category}</option>`).join('')}</select></label></div><label>태그<input name="tags" value="${escape(value.tags.join(', '))}" placeholder="쉼표로 구분"></label><label>본문 <textarea name="body" required>${escape(value.body)}</textarea></label><div class="editor-actions"><button type="button" id="back">목록</button><button type="submit" class="primary">저장</button><button type="button" id="publish" class="accent">${value.status === 'published' ? '초안으로 전환' : '발행'}</button></div></form><div class="preview"><p class="eyebrow">PREVIEW</p><div id="preview-body" class="preview-body"></div></div>`,
  );
  const form = document.querySelector<HTMLFormElement>('#editor-form')!;
  form.addEventListener('input', () => {
    editorDirty = true;
  });
  const body = form.elements.namedItem('body') as HTMLTextAreaElement;
  const pane = document.querySelector<HTMLElement>('.preview')!;
  const workspace = document.createElement('div');
  workspace.className = 'editor-workspace';
  form.before(workspace);
  workspace.append(form, pane);
  const tabs = document.createElement('div');
  tabs.className = 'editor-tabs';
  tabs.innerHTML =
    '<button type="button" aria-pressed="true">편집</button><button type="button" aria-pressed="false">미리보기</button>';
  workspace.before(tabs);
  tabs.querySelectorAll('button').forEach(
    (button, index) =>
      (button.onclick = () => {
        workspace.dataset.tab = index ? 'preview' : 'editor';
        tabs.querySelectorAll('button').forEach((tab, i) => tab.setAttribute('aria-pressed', String(index === i)));
      }),
  );
  let previewRevision = 0;
  const preview = async () => {
    const revision = ++previewRevision;
    const target = pane.querySelector('#preview-body')!;
    try {
      const { renderViewer } = await import('../../src/shared/markdown/render-viewer');
      const html = await renderViewer(body.value);
      if (revision !== previewRevision || !form.isConnected) return;
      const data = Object.fromEntries(new FormData(form));
      target.innerHTML = `<header class="preview-article-header"><small>${escape(String(data.category))} · ${escape(String(data.pubDate))}</small><h1>${escape(String(data.title) || '제목 없는 초안')}</h1><p>${escape(String(data.description))}</p></header><div class="preview-prose">${html || '<p class="muted">본문을 입력하면 여기에 표시됩니다.</p>'}</div>`;
    } catch {
      if (revision === previewRevision) target.textContent = '미리보기를 불러오지 못했습니다.';
    }
  };
  let saveTimer: number | undefined;
  cancelEditorTimer = () => {
    window.clearTimeout(saveTimer);
    previewRevision++;
  };
  body.oninput = () => {
    preview();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveForm(form), 2000);
  };
  form.querySelectorAll('input, select').forEach((field) =>
    field.addEventListener('input', () => {
      void preview();
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveForm(form), 2000);
    }),
  );
  void preview();
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'danger-button';
  discard.textContent = post?.repoPath || post?.desiredVisibility === 'published' ? '수정 초안 버리기' : '초안 삭제';
  form.querySelector('.editor-actions')!.append(discard);
  discard.onclick = async () => {
    const backed = Boolean(activePost?.repoPath || activePost?.desiredVisibility === 'published');
    if (
      !confirm(
        backed
          ? '수정 초안을 버리고 저장소 원본으로 되돌릴까요? 공개 글은 삭제되지 않습니다.'
          : '초안을 삭제할까요? 삭제한 초안은 복구할 수 없습니다.',
      )
    )
      return;
    cancelEditorTimer();
    discard.disabled = true;
    form.inert = true;
    try {
      await saveInFlight;
      if (!form.isConnected) return;
      const target = activePost;
      if (target) await api.discard(target, csrfToken);
      if (!form.isConnected) return;
      activePost = undefined;
      await renderPosts();
    } catch (error) {
      discard.disabled = false;
      form.inert = false;
      if (form.isConnected)
        document.querySelector('#save-status')!.textContent = error instanceof Error ? error.message : '삭제 실패';
    }
  };
  enhanceControls(form);
  document.querySelector('#back')!.addEventListener('click', () => renderView('posts'));
  form.onsubmit = async (event) => {
    event.preventDefault();
    await saveForm(form);
  };
  document.querySelector('#publish')!.addEventListener('click', async () => {
    await saveForm(form);
    if (!activePost) return;
    try {
      const result = await api.publish(activePost, csrfToken, activePost.status === 'published');
      document.querySelector('#save-status')!.textContent = `발행 작업 접수됨 (${result.state})`;
    } catch (error) {
      document.querySelector('#save-status')!.textContent = error instanceof Error ? error.message : '발행 실패';
    }
  });
}

async function saveForm(form: HTMLFormElement) {
  const task = (saveInFlight ?? Promise.resolve()).then(async () => {
    if (form.isConnected && !form.inert) await persistForm(form);
  });
  saveInFlight = task;
  try {
    await task;
  } finally {
    if (saveInFlight === task) saveInFlight = undefined;
  }
}

async function persistForm(form: HTMLFormElement) {
  const data = Object.fromEntries(new FormData(form));
  const input = {
    title: String(data.title),
    description: String(data.description),
    pubDate: String(data.pubDate),
    category: String(data.category),
    tags: String(data.tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    body: String(data.body),
  };
  const target = activePost;
  const status = document.querySelector('#save-status');
  try {
    let saved: Post;
    if (target) {
      const result = await api.save({ ...target, ...input }, csrfToken);
      saved = { ...target, ...input, version: result.version, updatedAt: result.savedAt };
    } else saved = await api.create(input, csrfToken);
    if (form.isConnected) {
      activePost = saved;
      editorDirty = JSON.stringify(Object.fromEntries(new FormData(form))) !== JSON.stringify(data);
      if (status) status.textContent = '저장됨';
    }
  } catch (error) {
    if (form.isConnected && status) status.textContent = error instanceof Error ? error.message : '저장 실패';
  }
}

async function flushEditor() {
  const form = document.querySelector<HTMLFormElement>('#editor-form');
  if (!form || form.inert) return !form;
  if (editorDirty) {
    cancelEditorTimer();
    await saveForm(form);
  }
  return !editorDirty;
}

window.addEventListener('beforeunload', (event) => {
  if (editorDirty && currentView === 'editor') {
    event.preventDefault();
    event.returnValue = '';
  }
});

const viewPaths: Record<string, string> = {
  analytics: '/admin/',
  posts: '/admin/posts/',
  editor: '/admin/editor/',
  comments: '/admin/comments/',
};
const viewFromPath = () => Object.entries(viewPaths).find(([, path]) => location.pathname === path)?.[0] ?? 'analytics';
async function renderView(view: string, pushHistory = true) {
  if (!(await flushEditor())) return;
  if (pushHistory && location.pathname !== viewPaths[view]) history.pushState({ view }, '', viewPaths[view]);
  try {
    if (view === 'analytics') await renderAnalytics();
    else if (view === 'editor') renderEditor();
    else if (view === 'comments') await renderComments();
    else await renderPosts();
  } catch {
    shell(
      '<div class="login"><h1>화면을 불러오지 못했습니다</h1><p>관리자 데이터 연결 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.</p><button class="primary" type="button" id="retry-view">다시 시도</button></div>',
    );
    document.querySelector<HTMLButtonElement>('#retry-view')!.onclick = () => void renderView(view, false);
  }
}

window.addEventListener('popstate', () => {
  void renderView(viewFromPath(), false);
});
api
  .session()
  .then((session) => {
    csrfToken = session.csrfToken;
    void renderView(viewFromPath(), false);
  })
  .catch(() => {
    app.innerHTML =
      '<main class="login"><p class="eyebrow">PRIVATE ARCHIVE</p><h1>관리자 서재</h1><p>본인 GitHub 계정으로 로그인해 글과 통계를 관리합니다.</p><a class="primary link-button" href="/auth/github">GitHub로 로그인</a></main>';
  });
