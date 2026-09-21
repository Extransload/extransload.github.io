import { expect, test } from '@playwright/test';

test('light theme preserves Shiki token colors inside syntax-highlighted code blocks', async ({ page }) => {
  await page.goto('/blog/posts/algorithm-java-swea/');

  const codeBlock = page.locator('pre[data-language="java"]').first();
  await expect(codeBlock).toBeVisible();

  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'light';
  });

  const tokenColors = await codeBlock
    .locator('code span[style*="color"]')
    .evaluateAll((tokens) => [...new Set(tokens.map((token) => getComputedStyle(token).color))]);

  expect(tokenColors.length).toBeGreaterThan(2);
});

test('light theme remaps Bash options from bright blue to muted ink', async ({ page }) => {
  await page.goto('/blog/posts/macos-space/');

  const codeBlock = page.locator('pre[data-language="bash"]').nth(1);
  await expect(codeBlock).toBeVisible();

  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'light';
  });

  const tokenColors = await codeBlock
    .locator('code span[style*="color"]')
    .evaluateAll((tokens) => [...new Set(tokens.map((token) => getComputedStyle(token).color))]);

  expect(tokenColors).not.toContain('rgb(121, 184, 255)');
  expect(tokenColors).toContain('rgb(73, 109, 134)');
});

test('light code panels keep the same fixed-scale surface as tables at any height', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/blog/posts/macos-space/');
  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'light';
  });

  const codeShell = page.locator('.code-shell').first();
  const table = page.locator('.article__content table').first();
  await expect(codeShell).toBeVisible();
  await expect(table).toBeVisible();

  const surfaceStyles = async (locator: typeof codeShell) =>
    locator.evaluate((element) => {
      const surface = getComputedStyle(element);
      const texture = getComputedStyle(element, '::before');
      return {
        backgroundColor: surface.backgroundColor,
        borderColor: surface.borderColor,
        textureImage: texture.backgroundImage,
        textureColor: texture.backgroundColor,
        textureOpacity: texture.opacity,
        textureRepeat: texture.backgroundRepeat,
        textureSize: texture.backgroundSize,
      };
    });

  expect(await surfaceStyles(codeShell)).toEqual(await surfaceStyles(table));

  await page.goto('/blog/posts/algorithm-python-boj/');
  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'light';
  });
  const tallCodeShell = page
    .locator('.code-shell')
    .filter({
      has: page.locator('pre[data-language="python"]'),
    })
    .first();
  await expect(tallCodeShell).toBeVisible();
  expect((await tallCodeShell.boundingBox())!.height).toBeGreaterThan(1000);

  const codeTexture = await tallCodeShell.evaluate((element) => {
    const layer = getComputedStyle(element, '::before');
    return {
      backgroundRepeat: layer.backgroundRepeat,
      backgroundSize: layer.backgroundSize,
    };
  });
  expect(codeTexture.backgroundRepeat).toBe('no-repeat, repeat');
  expect(codeTexture.backgroundSize).toBe('auto, 576px 576px');
});

test('light tools and copy toasts use the same fixed-scale surface as tables', async ({ page }) => {
  await page.goto('/blog/posts/macos-space/');
  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'light';
  });

  await page.locator('.code-shell__copy').first().click();
  await page.locator('[data-feature-toggle]').click();

  const table = page.locator('.article__content table').first();
  const toolsPanel = page.locator('.feature-bundle__panel');
  const toolsToggle = page.locator('.feature-bundle__toggle');
  const toast = page.locator('.code-copy-toast').first();
  await expect(table).toBeVisible();
  await expect(toolsPanel).toBeVisible();
  await expect(toast).toBeVisible();

  const surfaceStyles = async (locator: typeof table) =>
    locator.evaluate((element) => {
      const surface = getComputedStyle(element);
      const texture = getComputedStyle(element, '::before');
      return {
        backgroundColor: surface.backgroundColor,
        borderColor: surface.borderColor,
        textureImage: texture.backgroundImage,
        textureColor: texture.backgroundColor,
        textureOpacity: texture.opacity,
        textureRepeat: texture.backgroundRepeat,
        textureSize: texture.backgroundSize,
      };
    });

  const tableSurface = await surfaceStyles(table);
  for (const surface of [toolsPanel, toolsToggle, toast]) {
    expect(await surfaceStyles(surface)).toEqual(tableSurface);
  }
});
