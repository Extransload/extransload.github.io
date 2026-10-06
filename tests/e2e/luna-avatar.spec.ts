import { expect, test } from '@playwright/test';

test('Luna persists from the wardrobe into actual solo win and loss animations', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Deterministic opponent moves; the real board, legal move checks and result UI run normally.
  await context.route('**/ai-worker*.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `self.onmessage = ({data}) => {
      const n = data.board.filter(value => value === 1).length;
      self.postMessage({id: data.id, point: {x: 15 - n, y: 14}});
    };`,
    }),
  );
  await page.goto('/playroom/omokmaru/wardrobe/?category=avatar');
  await page.locator('[data-item-id="luna"]').click();
  await expect(page.locator('#studio-canvas')).toHaveAttribute('data-luna-black', 'ready', { timeout: 30_000 });
  await expect(page.locator('#studio-luna-credit')).toBeVisible();
  await expect(page.locator('#studio-petal-credit')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-item-id="luna"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('관리자 로그인', { exact: true })).toHaveCount(0);
  await expect(page.getByText('기본 보기', { exact: true })).toHaveCount(0);
  await page.goto('/playroom/omokmaru/solo/');
  await page.locator('#side-white').click();
  await expect(page.locator('#canvas')).toHaveAttribute('data-avatar-black', 'luna');
  await expect(page.locator('#canvas')).toHaveAttribute('data-avatar-white', 'luna');
  await expect(page.locator('#canvas')).toHaveAttribute('data-luna-white', 'ready', { timeout: 30_000 });
  await page.locator('#start').click();
  const canvas = page.locator('#canvas canvas');
  await canvas.focus();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
  }
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#status')).toHaveText('내 차례');
    if (i) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#status')).toHaveText('승리!');
  await expect(page.locator('#canvas')).toHaveAttribute('data-avatar-white-motion', 'win');
  await page.locator('#start').click();
  await expect(page.locator('#canvas')).toHaveAttribute('data-avatar-white-motion', 'idle');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#resign-solo').click();
  await expect(page.locator('#status')).toHaveText('패배');
  await expect(page.locator('#canvas')).toHaveAttribute('data-avatar-white-motion', 'lose');
  expect(errors).toEqual([]);
});
