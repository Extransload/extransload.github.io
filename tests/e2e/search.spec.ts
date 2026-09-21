import { expect, test } from '@playwright/test';

const SEARCH_TERM = 'git';

test('the header control opens and closes the search modal', async ({ page }) => {
  await page.goto('/blog/posts/');
  const modal = page.locator('[data-search-modal]');

  await expect(modal).toBeHidden();
  await page.locator('[data-search-open]').first().click();
  await expect(modal).toBeVisible();
  await expect(page.locator('.search-modal__dialog')).toHaveAttribute('aria-modal', 'true');

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('the modal searches the built Pagefind index', async ({ page }) => {
  await page.goto('/blog/posts/');
  await page.locator('[data-search-open]').first().click();

  const input = page.locator('.search-modal .pagefind-ui__search-input');
  await expect(input).toBeVisible();
  await input.fill(SEARCH_TERM);

  const results = page.locator('.search-modal .pagefind-ui__result-link');
  await expect(results.first()).toBeVisible({ timeout: 15000 });
  await expect(results.first()).toHaveAttribute('href', /\/blog\/posts\//);
});

test('the home search carries its term into the modal', async ({ page }) => {
  await page.goto('/blog/');

  await page.locator('[data-home-search-input]').fill(SEARCH_TERM);
  await page.locator('[data-home-search-input]').press('Enter');

  await expect(page.locator('[data-search-modal]')).toBeVisible();
  await expect(page.locator('.search-modal .pagefind-ui__search-input')).toHaveValue(SEARCH_TERM);
});

test('the search page mounts the full Pagefind UI', async ({ page }) => {
  await page.goto('/blog/search/');

  const input = page.locator('#pagefind-search .pagefind-ui__search-input');
  await expect(input).toBeVisible();
  await input.fill(SEARCH_TERM);
  await expect(page.locator('#pagefind-search .pagefind-ui__result-link').first()).toBeVisible({ timeout: 15000 });
});

test('the search UI follows the active site theme', async ({ page }) => {
  await page.goto('/blog/search/');
  const surface = page.locator('.search-page');

  const readBackground = () =>
    surface.evaluate((node) => getComputedStyle(node).getPropertyValue('--pagefind-ui-background').trim());

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'midnight'));
  const midnight = await readBackground();

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const light = await readBackground();

  expect(midnight).not.toBe('');
  expect(light).not.toBe('');
  expect(light).not.toBe(midnight);
});
