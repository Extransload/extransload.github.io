import { test, expect } from '@playwright/test';

test('rolling graph advances after midnight and preserves the sidebar', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T23:59:00+09:00') });
  await page.goto('/admin/');
  await expect(page.locator('.trend-chart')).toBeVisible();
  await page.locator('.analytics-controls .control-trigger').click();
  await page.locator('[data-value="7"]').click();
  await page.locator('#period-apply').click();
  await expect(page.locator('#period-start')).toHaveValue('2026-09-02');
  await page.locator('.trend-chart svg').focus();
  const sidebar = await page.locator('.admin-shell > header').elementHandle();
  await page.clock.fastForward(315000);
  await expect(page.locator('#period-end')).toHaveValue('2026-09-09');
  await expect(page.locator('#period-start')).toHaveValue('2026-09-03');
  expect(await sidebar!.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole('button', { name: '방문자', exact: true }).click();
  await expect(page.locator('[data-metric="totalUsers"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.trend-chart svg').focus();
  await page.keyboard.press('End');
  await expect(page.locator('.trend-tooltip')).toContainText('2026-09-09');
  await page.screenshot({ path: 'test-results/admin-analytics.png', fullPage: true });
});

test('navigation saves edits before leaving the editor', async ({ page }) => {
  await page.goto('/admin/');
  await page.getByRole('button', { name: '새 글', exact: true }).click();
  await page.locator('[name="title"]').fill('이동 전 저장');
  await page.locator('[name="body"]').fill('즉시 이동해도 보존되는 본문');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  await page.getByRole('button').filter({ hasText: '이동 전 저장' }).click();
  await expect(page.locator('[name="body"]')).toHaveValue('즉시 이동해도 보존되는 본문');
});

test('editor control icons align at the field edge and use desktop popovers', async ({ page }) => {
  await page.goto('/admin/');
  await page.getByRole('button', { name: '새 글', exact: true }).click();
  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value && { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
    };
    return {
      date: rect('.date-control'),
      dateInput: rect('[name="pubDate"]'),
      calendar: rect('.calendar-trigger'),
      select: rect('.control-trigger'),
      chevron: rect('.control-chevron'),
    };
  });
  expect(geometry.dateInput!.right).toBeCloseTo(geometry.calendar!.left, 0);
  expect(Math.abs(geometry.calendar!.right - geometry.date!.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.chevron!.right - (geometry.select!.right - 14))).toBeLessThanOrEqual(1);
  await page.locator('.control-trigger').click();
  const trigger = await page.locator('.control-trigger').boundingBox();
  const dialog = await page.locator('dialog[open]').boundingBox();
  expect(dialog!.y).toBeGreaterThanOrEqual(trigger!.y + trigger!.height);
  expect(Math.abs(dialog!.x - trigger!.x)).toBeLessThanOrEqual(2);
});

test('analytics date controls stay inline on desktop', async ({ page }) => {
  await page.goto('/admin/');
  const controls = await page.locator('.analytics-controls .date-control').evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  expect(controls).toHaveLength(2);
  expect(Math.abs(controls[0].y - controls[1].y)).toBeLessThanOrEqual(2);
  expect(controls[0].width).toBeLessThan(300);
});

test('editor renders markdown, switches mobile preview and deletes draft', async ({ page }) => {
  await page.goto('/admin/');
  await page.getByRole('button', { name: '새 글', exact: true }).click();
  await page.locator('[name="title"]').fill('미리보기 테스트');
  await page.locator('[name="body"]').fill('## 제목\n\n**강조**와 본문\n\n> 인용문\n\n```js\nconst value = 1;\n```');
  await expect(page.locator('.preview-prose h2')).toHaveText('제목');
  await expect(page.locator('.preview-prose pre code')).toContainText('const value');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('저장됨');
  await page.screenshot({ path: 'test-results/admin-editor.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.locator('.preview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '편집', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '초안 삭제', exact: true }).click();
  await expect(page.getByRole('heading', { name: '글 관리' })).toBeVisible();
  await expect(page.locator('.post-list')).not.toContainText('미리보기 테스트');
});

test('calendar and dark theme remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/');
  await page.locator('#theme-toggle').click();
  await page.getByRole('button', { name: '시작일 달력 열기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.calendar-grid button').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.analytics-controls .control-trigger')).toContainText('직접 선택');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-dark-mobile.png', fullPage: true });
});

test('custom date range stays fixed across midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T23:59:00+09:00') });
  await page.goto('/admin/');
  await page.locator('#period-start').fill('2026-08-01');
  await page.locator('#period-end').fill('2026-08-31');
  await page.locator('#period-apply').click();
  await page.getByRole('heading', { name: '사이트 통계', exact: true }).click();
  await page.clock.fastForward(315000);
  await expect(page.locator('#period-start')).toHaveValue('2026-08-01');
  await expect(page.locator('#period-end')).toHaveValue('2026-08-31');
});
