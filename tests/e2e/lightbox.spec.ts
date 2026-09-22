import { expect, test, type Page } from '@playwright/test';

// The brief's original POST (`/blog/posts/macos-space/`) renders zero body
// images in the built site, so every test that opens the lightbox from a post
// body would fail before ever exercising the feature. heap-heapsort renders
// 23 body images, none of them inside links, so they all qualify.
const POST = '/blog/posts/heap-heapsort/';
const FOLIO = '/works/degureure/';

const scaleOf = async (page: Page) =>
  page.locator('.image-lightbox__img').evaluate((image) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { scale: matrix.a, tx: matrix.e, ty: matrix.f };
  });

test('a body image opens, locks the page, and restores focus on close', async ({ page }) => {
  await page.goto(POST);
  const dialog = page.locator('dialog.image-lightbox');
  await expect(dialog).toBeHidden();

  // Capture what actually holds focus before opening, rather than assuming
  // it is the clicked image: a plain <img> carries no tabindex here, so a
  // real mouse click blurs whatever was focused (back to <body>) before our
  // click handler ever runs. "Restore focus" must return to *this*, not to
  // the image.
  const activeBefore = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null);

  const image = page.locator('.article__content img[data-zoomable]').first();
  // The lightbox script reads `image.src` (the browser-resolved absolute
  // URL), not the raw `src` attribute, so compare against the same resolved
  // value the component actually uses.
  const source = await image.evaluate((element) => (element as HTMLImageElement).src);
  await image.click();

  await expect(dialog).toBeVisible();
  await expect(page.locator('.image-lightbox__img')).toHaveAttribute('src', source);
  await expect(page.locator('body')).toHaveClass(/lightbox-open/);
  // Opening moves focus onto the dialog's own close control.
  await expect(page.locator('[data-lightbox-close]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/lightbox-open/);

  // Focus must come back to whatever held it before the lightbox opened.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null))
    .toBe(activeBefore);
});

test('arrow keys move through a works gallery section and stop at the end', async ({ page }) => {
  await page.goto(FOLIO);
  const screens = page.locator('.work-doc__shots[data-lightbox-group]').last();
  const count = await screens.locator('img[data-zoomable]').count();
  expect(count).toBeGreaterThan(2);

  await screens.locator('img[data-zoomable]').first().click();
  await expect(page.locator('[data-lightbox-counter]')).toHaveText(`1 / ${count}`);
  await expect(page.locator('[data-lightbox-prev]')).toBeDisabled();

  for (let moves = 1; moves < count; moves++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-lightbox-counter]')).toHaveText(`${count} / ${count}`);
  await expect(page.locator('[data-lightbox-next]')).toBeDisabled();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-lightbox-counter]')).toHaveText(`${count - 1} / ${count}`);
});

test('controls and decorative images are left alone', async ({ page }) => {
  await page.goto(FOLIO);
  // The UCC poster is a link; the header brand and theme icons are inside controls.
  await expect(page.locator('.work-doc__shot-link img[data-zoomable]')).toHaveCount(0);

  await page.goto('/blog/');
  await expect(page.locator('.site-header img[data-zoomable]')).toHaveCount(0);
});

test('the wheel zooms toward the cursor and dragging moves the image', async ({ page }) => {
  await page.goto(POST);
  await page.locator('.article__content img[data-zoomable]').first().click();
  await expect(page.locator('dialog.image-lightbox')).toBeVisible();
  expect((await scaleOf(page)).scale).toBeCloseTo(1, 2);

  const stage = page.locator('[data-lightbox-stage]');
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Playwright's mouse.wheel dispatches a single wheel event carrying the
  // full delta (the handler calls preventDefault, so Chromium does not split
  // it into an animated series). The zoom factor is 1.1 ** (-deltaY / 100),
  // so -400 lands at exactly 1.1**4 = 1.4641 — short of 1.5. heap-heapsort's
  // body images are also small (~560px wide) next to the default 1280px
  // viewport's stage (~1144px), so the zoomed image needs enough scale to
  // exceed the stage width too, or the later drag has no room to pan. -1000
  // (scale ~2.59) clears both the 1.5 assertion and the pan headroom.
  await page.mouse.wheel(0, -1000);
  await expect.poll(async () => (await scaleOf(page)).scale).toBeGreaterThan(1.5);

  const before = await scaleOf(page);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2);
  await page.mouse.up();
  const after = await scaleOf(page);
  expect(after.tx).not.toBe(before.tx);

  await page.keyboard.press('0');
  await expect.poll(async () => (await scaleOf(page)).scale).toBeCloseTo(1, 2);
});

test('double click toggles between fitted and zoomed', async ({ page }) => {
  await page.goto(POST);
  await page.locator('.article__content img[data-zoomable]').first().click();
  const stage = page.locator('[data-lightbox-stage]');

  await stage.dblclick();
  await expect.poll(async () => (await scaleOf(page)).scale).toBeGreaterThan(2);

  await stage.dblclick();
  await expect.poll(async () => (await scaleOf(page)).scale).toBeCloseTo(1, 2);
});

test('a pinch gesture zooms', async ({ page }) => {
  await page.goto(POST);
  await page.locator('.article__content img[data-zoomable]').first().click();
  const stage = page.locator('[data-lightbox-stage]');
  const box = (await stage.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Two synthetic touch pointers moving apart.
  await stage.evaluate(
    (node, { cx, cy }) => {
      const send = (type: string, id: number, x: number, y: number) =>
        node.dispatchEvent(
          new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }),
        );
      node.setPointerCapture = () => {};
      send('pointerdown', 1, cx - 40, cy);
      send('pointerdown', 2, cx + 40, cy);
      send('pointermove', 1, cx - 160, cy);
      send('pointermove', 2, cx + 160, cy);
      send('pointerup', 1, cx - 160, cy);
      send('pointerup', 2, cx + 160, cy);
    },
    { cx, cy },
  );

  await expect.poll(async () => (await scaleOf(page)).scale).toBeGreaterThan(1.5);
});
