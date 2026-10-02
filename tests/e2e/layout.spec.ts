import { expect, test, type Page } from '@playwright/test';
import { works } from '../../src/domains/main/data/work-archive';
import { splashChapters } from '../../src/domains/main/data/splash-chapters';

/** Resolves a theme token to the rgb() string the browser computes for it. */
const themeColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);

/** 요소가 지금 계산된 불투명도. */
const opacityOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => parseFloat(getComputedStyle(element).opacity));

test('splash shows the whole book on one screen without a new splash client script', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(
    page.locator('[data-enhanced], [data-chapter-locked], [data-chapter-visible], [data-cover-ready]'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  for (const selector of ['.book-splash__crest', '.book-splash__title-glyph', '.book-splash__tagline']) {
    await expect(page.locator(selector)).toBeInViewport();
    expect(await opacityOf(page, selector)).toBe(1);
  }
  for (const chapter of splashChapters)
    await expect(page.locator(`a.splash-stop#${chapter.id}`)).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.splash-trail script')).toHaveCount(0);
  // The pre-existing shared lightbox remains; the trail itself adds no runtime.
  await expect(page.locator('script[src]')).toHaveCount(1);
  await expect(page.locator('script[src]')).toHaveAttribute('src', /\/_astro\/ImageLightbox\./);
});

test('splash keeps the original branding in a compact header at every width', async ({ page }) => {
  for (const [width, height] of [
    [1512, 830],
    [1440, 900],
    [1024, 768],
    [760, 900],
    [390, 844],
    [320, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.book-splash__crest-img')).toHaveAttribute(
      'src',
      '/images/splash-crest-embroidered.webp',
    );
    await expect(page.locator('.book-splash__title-glyph')).toHaveAttribute(
      'src',
      '/images/extransload-wordmark-crest-tone.webp',
    );
    await expect(page.locator('.book-splash__tagline')).toHaveText('쓰고 만들고 놀며, 한 장씩 채워갑니다.');
    const gaps = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const crest = box('.book-splash__crest');
      const mark = box('.book-splash__title-glyph');
      const tagline = box('.book-splash__tagline');
      return {
        crestToMark: mark.top - crest.bottom,
        markToTagline: tagline.top - mark.bottom,
        canvasGap: box('.splash-trail__canvas').top - tagline.bottom,
        headerBottom: box('.book-splash__face').bottom,
      };
    });
    expect(gaps.markToTagline).toBeGreaterThanOrEqual(0);
    expect(gaps.markToTagline).toBeLessThanOrEqual(16);
    expect(gaps.crestToMark).toBeGreaterThan(gaps.markToTagline * 3);
    expect(gaps.crestToMark).toBeLessThan(80);
    expect(gaps.canvasGap).toBeGreaterThanOrEqual(16);
    expect(gaps.headerBottom).toBeLessThan(240);
  }
});

test('splash gives the enlarged contents the space saved by the compact header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sizes = await page.evaluate(() => ({
    crest: document.querySelector('.book-splash__crest')!.getBoundingClientRect().width,
    title: document.querySelector('.book-splash__title-glyph')!.getBoundingClientRect().width,
    contents: document.querySelector('.splash-trail__canvas')!.getBoundingClientRect().width,
    art: document.querySelector('.splash-stop__art')!.getBoundingClientRect().width,
  }));
  expect(sizes.crest).toBeLessThan(80);
  expect(sizes.title).toBeLessThan(340);
  expect(sizes.contents).toBeGreaterThan(1100);
  expect(sizes.art).toBeGreaterThan(180);
});

test('splash trays and chapter targets fit the canvas without overlapping', async ({ page }) => {
  for (const [width, height] of [
    [1440, 900],
    [1512, 830],
    [1024, 768],
    [861, 700],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const layout = await page.evaluate(() => ({
      canvas: document.querySelector('.splash-trail__canvas')!.getBoundingClientRect().toJSON(),
      stops: [...document.querySelectorAll('.splash-stop')].map((e) => e.getBoundingClientRect().toJSON()),
    }));
    for (const box of layout.stops) {
      expect(box.left, `left @${width}`).toBeGreaterThanOrEqual(layout.canvas.left);
      expect(box.right, `right @${width}`).toBeLessThanOrEqual(layout.canvas.right);
      expect(box.bottom, `bottom @${width}`).toBeLessThanOrEqual(layout.canvas.bottom);
      expect(box.width).toBeGreaterThan(150);
    }
    for (let i = 0; i < layout.stops.length; i++)
      for (let j = i + 1; j < layout.stops.length; j++) {
        const a = layout.stops[i],
          b = layout.stops[j];
        expect(
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
          `targets ${i}/${j} overlap @${width}`,
        ).toBe(true);
      }
  }
});

test('splash sets each illustration on a leather-blue tray without a resting gold outline', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-trail-path], .splash-stop__mobile-path, .splash-stop__sketch')).toHaveCount(0);
  await expect(page.locator('.splash-stop__tray')).toHaveCount(splashChapters.length);
  for (const tray of await page.locator('.splash-stop__tray').all()) {
    const background = await tray.evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(background).toContain('rgba(7, 16, 28, 0.38)');
    expect(background).toContain('rgba(3, 10, 18, 0.52)');
    expect(await tray.locator('svg').evaluate((e) => getComputedStyle(e).fill)).toBe('none');
    expect(await tray.locator('.splash-stop__contour-rest').evaluate((e) => getComputedStyle(e).strokeOpacity)).toBe(
      '0',
    );
    expect(await tray.locator('.splash-stop__tray-shadow').evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe(
      'none',
    );
  }
  await expect(page.locator('.splash-stop__art svg.chapter-art')).toHaveCount(splashChapters.length);
});

test('splash preserves actual embroidery with matched capital height and pewter-to-gold layers', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const heights = [];
    for (const chapter of splashChapters) {
      const mark = page.locator(`#${chapter.id} .splash-stop__wordmark`);
      const layers = mark.locator('image');
      await expect(layers).toHaveCount(2);
      await expect(layers.first()).toHaveAttribute('href', chapter.wordmark.src);
      await expect(layers.last()).toHaveAttribute('href', chapter.wordmark.src);
      await expect(mark).toHaveAttribute('aria-hidden', 'true');
      const rendered = (await mark.boundingBox())!;
      heights.push((rendered.width / chapter.wordmark.width) * chapter.wordmark.capHeight);

      const pewter = mark.locator('filter').first().locator('feComponentTransfer').last();
      await expect(pewter.locator('feFuncR')).toHaveAttribute('slope', '0.78');
      await expect(pewter.locator('feFuncG')).toHaveAttribute('slope', '0.79');
      await expect(pewter.locator('feFuncB')).toHaveAttribute('slope', '0.76');

      const gold = mark.locator('filter').last().locator('feComponentTransfer').last();
      await expect(gold.locator('feFuncR')).toHaveAttribute('slope', '1.16');
      await expect(gold.locator('feFuncG')).toHaveAttribute('slope', '0.97');
      await expect(gold.locator('feFuncB')).toHaveAttribute('slope', '0.61');
      await expect(mark.locator('feFuncA')).toHaveCount(0);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.1);
  }
});

test('splash wordmark rests in pewter silver and crossfades to gold on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const stop = page.locator('#works');
  const base = stop.locator('.splash-stop__wordmark-layer--pewter');
  const gold = stop.locator('.splash-stop__wordmark-layer--gold');

  expect(await base.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  expect(await gold.evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  expect(await gold.evaluate((e) => getComputedStyle(e).transitionDuration)).not.toMatch(/^0s(, 0s)*$/);

  await stop.hover();
  await expect.poll(() => gold.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
});

test('splash keeps the contents wordmarks subordinate to their artwork', async ({ page }) => {
  for (const { width, maxHeight } of [
    { width: 1440, maxHeight: 44 },
    { width: 390, maxHeight: 39 },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const heights = await page
      .locator('.splash-stop__wordmark')
      .evaluateAll((marks) => marks.map((mark) => mark.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeLessThanOrEqual(maxHeight);
  }
});

test('splash chapters retain their data, accessible names and destinations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a.splash-stop')).toHaveCount(splashChapters.length);
  for (const chapter of splashChapters) {
    const stop = page.locator(`a.splash-stop#${chapter.id}`);
    await expect(stop).toHaveAttribute('href', chapter.href);
    await expect(stop).toHaveAccessibleName(chapter.label);
    await expect(stop).toHaveAccessibleDescription(chapter.description);
    await expect(stop.locator('.splash-stop__title')).toHaveText(chapter.label);
    await expect(stop.locator('.splash-stop__wordmark image').first()).toHaveAttribute('href', chapter.wordmark.src);
  }
});

test('splash hover draws only its own contour without moving the link target', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const stop = page.locator('#works');
  const trace = stop.locator('.splash-stop__contour-trace');
  const before = await stop.boundingBox();
  expect(await trace.evaluate((e) => getComputedStyle(e).strokeDashoffset)).toBe('1px');
  await stop.hover();
  await expect.poll(() => trace.evaluate((e) => getComputedStyle(e).strokeDashoffset)).toBe('0px');
  expect(await trace.evaluate((e) => getComputedStyle(e).opacity)).toBe('0.88');
  for (const other of await page.locator('.splash-stop:not(#works) .splash-stop__contour-trace').all())
    expect(await other.evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  expect(await stop.boundingBox()).toEqual(before);
  await page.mouse.move(10, 10);
  await expect.poll(() => trace.evaluate((e) => getComputedStyle(e).strokeDashoffset)).toBe('1px');
  await expect.poll(() => opacityOf(page, '#works .splash-stop__invitation')).toBe(0);
});

test('splash gives each illustration its own hover response', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (const [id, detail] of [
    ['journal', '.art-drifter'],
    ['works', '.art-drifter'],
    ['playroom', '.art-orbit'],
    ['about', '.art-drifter'],
    ['guestbook', '.art-letter'],
  ]) {
    const stop = page.locator(`#${id}`);
    const part = stop.locator(detail);
    const before = await part.evaluate((e) => getComputedStyle(e).transform);
    await stop.hover();
    await expect.poll(() => part.evaluate((e) => getComputedStyle(e).transform)).not.toBe(before);
    await expect.poll(() => opacityOf(page, `#${id} .splash-stop__invitation`)).toBe(1);
  }
});

test('splash follows the link immediately without waiting for hover', async ({ page }) => {
  await page.goto('/');
  await page.locator('a.splash-stop#playroom').click();
  await expect(page).toHaveURL(/\/playroom\/$/);
});

test('splash keyboard focus follows editorial order and draws the same contour', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('a.splash-stop').first().focus();
  for (const chapter of splashChapters) {
    const stop = page.locator(`#${chapter.id}`);
    await expect(stop).toBeFocused();
    await expect.poll(() => opacityOf(page, `#${chapter.id} .splash-stop__invitation`)).toBe(1);
    expect(await stop.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('dashed');
    await expect
      .poll(() =>
        page
          .locator(`#${chapter.id} .splash-stop__contour-trace`)
          .first()
          .evaluate((e) => getComputedStyle(e).opacity),
      )
      .toBe('0.88');
    await page.keyboard.press('Tab');
  }
  await page.locator('#works').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/works\/$/);
});

test('splash uses the same links as a readable illustrated list on narrow screens', async ({ page }) => {
  for (const width of [320, 390, 760, 860]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('a.splash-stop')).toHaveCount(splashChapters.length);
    const boxes = await page
      .locator('a.splash-stop')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom);
      expect(boxes[i].left).toBe(boxes[0].left);
    }
    for (const chapter of splashChapters) {
      await expect.poll(() => opacityOf(page, `#${chapter.id} .splash-stop__invitation`)).toBe(0);
      expect(await opacityOf(page, `#${chapter.id} .splash-stop__art`)).toBe(1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    const alignment = await page.locator('.splash-stop').evaluateAll((es) =>
      es.map((e) => {
        const art = e.querySelector('.splash-stop__art')!.getBoundingClientRect();
        const copy = e.querySelector('.splash-stop__copy')!.getBoundingClientRect();
        return { center: copy.x + copy.width / 2, artCenter: art.x + art.width / 2, gap: copy.top - art.bottom };
      }),
    );
    for (const { center, artCenter, gap } of alignment) {
      expect(Math.abs(center - width / 2)).toBeLessThan(1);
      expect(Math.abs(artCenter - center)).toBeLessThan(3);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(24);
    }
  }
});

test('splash touch navigation needs only one tap', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(test.info().project.use.baseURL as string);
  await expect.poll(() => opacityOf(page, '#works .splash-stop__invitation')).toBe(0);
  await page.locator('#works').tap();
  await expect(page).toHaveURL(/\/works\/$/);
  await context.close();
});

test('splash contours and destinations work with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(test.info().project.use.baseURL as string);
  await page.locator('#works').hover();
  await expect.poll(() => opacityOf(page, '#works .splash-stop__invitation')).toBe(1);
  await expect
    .poll(() =>
      page
        .locator('#works .splash-stop__contour-trace')
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
    )
    .toBe('0.88');
  await page.locator('#works').click();
  await expect(page).toHaveURL(/\/works\/$/);
  await context.close();
});

test('splash keeps hover animation enabled when the OS requests reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const stop = page.locator('#works');
  const art = stop.locator('.splash-stop__art');
  const detail = stop.locator('.art-drifter');
  const artBefore = await art.evaluate((e) => getComputedStyle(e).transform);
  const detailBefore = await detail.evaluate((e) => getComputedStyle(e).transform);
  await stop.hover();

  await expect.poll(() => art.evaluate((e) => getComputedStyle(e).transform)).not.toBe(artBefore);
  await expect.poll(() => detail.evaluate((e) => getComputedStyle(e).transform)).not.toBe(detailBefore);
  expect(await art.evaluate((e) => getComputedStyle(e).transitionDuration)).not.toMatch(/^0s(, 0s)*$/);
  expect(
    await stop.locator('.splash-stop__contour-trace').evaluate((e) => getComputedStyle(e).transitionDuration),
  ).not.toMatch(/^0s(, 0s)*$/);
  await expect.poll(() => opacityOf(page, '#works .splash-stop__invitation')).toBe(1);
  await expect(stop).toBeInViewport();
  await stop.click();
  await expect(page).toHaveURL(/\/works\/$/);
});

test('works presents a scannable contents page for every folio', async ({ page }) => {
  await page.goto('/works/');

  const folios = page.locator('.works-index__item');
  await expect(folios).toHaveCount(4);
  // The contents page follows the archive's own order.
  await expect(page.locator('.works-index__name')).toHaveText(works.map((project) => project.title));
  await expect(folios.first()).toContainText('2026.07.24 — 현재');
  await expect(page.locator('.works-index__link').first()).toHaveAttribute('href', '/works/notepane/');

  const logos = page.locator('.works-index__logo');
  await expect(logos).toHaveCount(4);
  for (const logo of await logos.all()) {
    expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    if (await logo.evaluate((image) => image.closest('[data-project]')?.getAttribute('data-project') === 'citewell')) {
      await expect(logo).toHaveAttribute('alt', '');
      await expect(page.locator('.works-index__cover-wordmark')).toHaveText('CiteWell');
    } else {
      expect(await logo.getAttribute('alt')).toBeTruthy();
    }
  }

  await expect(page.locator('.works-patents__item')).toHaveCount(2);

  const removedRoute = await page.request.get('/portfolio/');
  expect(removedRoute.status()).toBe(404);
});

test('works opens a dedicated folio for each project', async ({ page }) => {
  await page.goto('/works/');
  await page.locator('.works-index__link').first().click();

  await expect(page).toHaveURL(/\/works\/notepane\/$/);
  await expect(page.getByRole('heading', { name: 'NotePane', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'GitHub', exact: false })).toHaveAttribute(
    'href',
    'https://github.com/Extransload/NotePane',
  );

  const chapters = page.locator('section[data-chapter]');
  await expect(chapters).toHaveCount(3);
  await expect(chapters.first()).toContainText('요구사항');
  await expect(chapters.first()).toContainText('구현');
  await expect(chapters.first()).toContainText('남긴 것');
  await expect(page.locator('.work-doc__rail a[data-rail-link]')).toHaveCount(3);

  await page.locator('.work-doc__nav a').last().click();
  // From the first folio the last nav link is the one that follows it.
  await expect(page).toHaveURL(new RegExp(`/works/${works[1].slug}/$`));

  await page.locator('.work-doc__back').click();
  await expect(page).toHaveURL(/\/works\/$/);
});

test('folios with captured screens render them without broken images', async ({ page }) => {
  await page.goto('/works/degureure/');

  // Compare against the archive data rather than a literal, so adding a
  // screen to the folio does not fail the test.
  const declared = works.find((project) => project.slug === 'degureure')!.gallery.length;
  const shots = page.locator('.work-doc__shots img');
  await expect(shots).toHaveCount(declared);

  for (const shot of await shots.all()) {
    await expect(shot).toHaveJSProperty('complete', true);
    expect(await shot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    expect(await shot.getAttribute('alt')).toBeTruthy();
  }

  await expect(page.locator('.work-doc__shots figcaption').first()).not.toBeEmpty();
});

test('works keeps its project ledger readable on a manuscript surface in both themes', async ({ page }) => {
  await page.goto('/works/');

  const readSurface = () =>
    page.locator('.works-leaf').evaluate((element) => {
      const surface = getComputedStyle(element);
      const texture = getComputedStyle(element, '::before');
      return {
        color: surface.color,
        background: surface.backgroundColor,
        texture: texture.backgroundImage,
        textureOpacity: Number(texture.opacity),
      };
    });

  const darkSurface = await readSurface();
  expect(darkSurface.texture).toContain('article-manuscript-paper-texture.webp');
  expect(darkSurface.textureOpacity).toBeGreaterThan(0);

  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'light'));
  const lightSurface = await readSurface();
  expect(lightSurface.background).not.toBe(darkSurface.background);
  expect(lightSurface.color).not.toBe(darkSurface.color);
  expect(lightSurface.texture).toContain('article-manuscript-paper-texture.webp');
  expect(lightSurface.textureOpacity).toBeGreaterThan(0);
});

test('works keeps the leather backdrop at a fixed texture scale', async ({ page }) => {
  await page.goto('/works/');

  const backdrop = await page.locator('.works-page').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { image: style.backgroundImage, size: style.backgroundSize };
  });

  expect(backdrop.image).toContain('works-leather-texture-v2.webp');
  expect(backdrop.size).not.toBe('cover');
});

test('works keeps the manuscript texture beneath the dark reading surface', async ({ page }) => {
  await page.goto('/works/');

  const textureOpacity = await page
    .locator('.works-leaf')
    .evaluate((element) => Number(getComputedStyle(element, '::before').opacity));

  expect(textureOpacity).toBeLessThanOrEqual(0.1);
});

test('works keeps small ledger text legible on the light manuscript', async ({ page }) => {
  await page.goto('/works/');
  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'light'));

  const contrastRatios = await page.evaluate(() => {
    const rgb = (value: string) =>
      value
        .match(/\d+(?:\.\d+)?/g)!
        .slice(0, 3)
        .map(Number);
    const luminance = (value: string) =>
      rgb(value)
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const paper = getComputedStyle(document.querySelector('.works-leaf')!).backgroundColor;

    return [
      '.works-kicker',
      '.works-index__folio',
      '.works-index__period',
      '.works-index__role',
      '.works-colophon',
    ].map((selector) => {
      const foreground = getComputedStyle(document.querySelector(selector)!).color;
      const [lighter, darker] = [luminance(foreground), luminance(paper)].sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    });
  });

  for (const ratio of contrastRatios) expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('works manuscript stays inside narrow mobile viewports', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/works/');

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      leaf: document.querySelector('.works-leaf')?.getBoundingClientRect().width,
    }));

    expect(dimensions.page).toBe(dimensions.viewport);
    expect(dimensions.leaf).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test('works tracks the chapter being read in the folio rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/works/citewell/');

  const rail = page.locator('.work-doc__rail a[data-rail-link]');
  await expect(rail.first()).toHaveAttribute('aria-current', 'true');

  // 05장 제목을 추적선(뷰포트 30%) 위로 확실히 올린다
  await page.evaluate(() => {
    const heading = document.querySelector('#ch-05');
    if (!heading) throw new Error('chapter 05 heading is missing');
    window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.1 });
  });
  await page.waitForTimeout(400);

  const active = page.locator('.work-doc__rail a[aria-current="true"]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-rail-link', 'ch-05');
});

test('works preserves the full archive when motion is reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/works/');

  await expect(page.locator('[data-works-scroll]')).toHaveAttribute('data-works-motion', 'reduced');
  await expect(page.locator('.works-index__item').first()).toHaveAttribute('data-revealed', 'true');

  // 상세 폴리오는 등장 애니메이션 없이 처음부터 전부 보인다
  await page.goto('/works/citewell/');
  await expect(page.locator('section[data-chapter]').last()).toHaveCSS('opacity', '1');
});

test('the folio keeps every chapter visible without entrance motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/works/citewell/');

  const opacities = await page
    .locator('section[data-chapter]')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
  expect(opacities.every((value) => value === '1')).toBe(true);
});

test('the folio rail stays in view on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/works/citewell/');

  await expect(page.locator('.work-doc__rail')).toHaveCSS('position', 'sticky');
});

test('sidebar reading icons show collapse-style tooltips on hover and focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/');

  const controls = page.locator('.site-header__controls');
  const themeToggle = controls.locator('[data-theme-toggle]');
  const focusToggle = controls.locator('[data-focus-mode]');
  const searchButton = controls.locator('[data-search-open]');

  await expect(themeToggle.locator('.site-header__control-hint')).toHaveText('라이트 테마로 전환');
  await expect(focusToggle.locator('.site-header__control-hint')).toHaveText('집중해서 보기');
  await expect(searchButton.locator('.site-header__control-hint')).toHaveText('검색 열기');
  await expect(themeToggle.locator('.site-header__control-hint')).toBeHidden();
  await themeToggle.hover();
  await expect(themeToggle.locator('.site-header__control-hint')).toBeVisible();
  expect(await themeToggle.evaluate((element) => getComputedStyle(element).filter)).toBe('none');
  expect(
    await themeToggle.locator('.site-header__control-hint').evaluate((element) => {
      const style = getComputedStyle(element);
      return { filter: style.filter, textShadow: style.textShadow };
    }),
  ).toEqual({ filter: 'none', textShadow: 'none' });
  await focusToggle.focus();
  await expect(focusToggle.locator('.site-header__control-hint')).toBeVisible();
  expect(await focusToggle.evaluate((element) => getComputedStyle(element).filter)).toBe('none');
});

test('playroom lists Omokmaru, opens its board, and About remains standalone', async ({ page }) => {
  await page.goto('/playroom/');
  await expect(page.locator('.game-list')).toBeVisible();
  await expect(page.locator('.playroom-intro h1 img')).toHaveAttribute('alt', 'Playroom');
  await expect(page.locator('.playroom-home')).toHaveAttribute('href', '/');
  const homeDoor = await page.locator('.playroom-home').boundingBox();
  const door = page.locator('.door-leaf');
  const closed = await door.evaluate((element) => getComputedStyle(element).transform);
  await page.locator('.playroom-home').hover();
  await expect.poll(() => door.evaluate((element) => getComputedStyle(element).transform)).not.toBe(closed);
  await page.mouse.move(500, 160);
  await expect.poll(() => door.evaluate((element) => getComputedStyle(element).transform)).toBe(closed);
  await expect(page.locator('.stage canvas')).toHaveCount(0);
  await page.locator('a.game-card[href="/playroom/omokmaru/"]').click();
  await expect(page).toHaveURL(/\/playroom\/omokmaru\/$/);
  await expect(page.locator('#lobby-nav .door-control')).toHaveAttribute('href', '/playroom/');
  const lobbyDoor = await page.locator('#lobby-nav .door-control').boundingBox();
  expect(Math.abs(lobbyDoor!.x - homeDoor!.x)).toBeLessThan(1);
  expect(Math.abs(lobbyDoor!.y - homeDoor!.y)).toBeLessThan(1);
  await expect(page.locator('.lobby-heading h1')).toHaveText('Omokmaru');
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#game')).toBeHidden();
  await expect(page.locator('#nav-forward')).toHaveCount(0);
  await expect(page.locator('.top-home')).toHaveCount(0);
  await expect(page.locator('.stage canvas')).toBeHidden();
  await page.locator('#lobby-nav .door-control').click();
  await expect(page).toHaveURL(/\/playroom\/$/);
  await page.locator('a.game-card[href="/playroom/omokmaru/"]').click();
  await expect(page.locator('#create')).toBeVisible();
  await expect(page.locator('#create')).toBeEnabled();
  await page.goto('/about/');
  await expect(page.locator('.main-space-page')).toContainText('Coming soon');
  await expect(page.locator('.site-header')).toHaveCount(0);
});

test('Playroom animations stay active under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/playroom/');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  for (const selector of ['.door-leaf', '.door-light', '.game-card', '.game-card-board', '.game-card-cta span']) {
    expect(
      await page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).not.toBe('0s');
  }
  await page.goto('/playroom/omokmaru/solo/');
  await expect(page.locator('#stage-overlay .overlay-card')).toHaveCSS('animation-name', 'overlay-enter');
  await page.locator('#side-white').click();
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('내 차례');
  await expect(page.locator('.player.active .piece')).toHaveCSS('animation-name', 'turn-piece-pulse');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#sound').click();
  const canvas = page.locator('.canvas canvas');
  const firstPulse = await canvas.screenshot();
  await page.waitForTimeout(250);
  expect((await canvas.screenshot()).equals(firstPulse)).toBe(false);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('#resign-solo').click();
  const firstVictory = await canvas.screenshot();
  await page.waitForTimeout(300);
  expect((await canvas.screenshot()).equals(firstVictory)).toBe(false);

  await page.goto('/playroom/omokmaru/');
  await page.evaluate(() => {
    const clock = document.querySelector<HTMLElement>('#clock-black')!;
    clock.classList.add('urgent');
    const ready = document.querySelector<HTMLElement>('#black-ready')!;
    ready.classList.add('is-ready');
  });
  await expect(page.locator('#clock-black')).toHaveCSS('animation-name', 'clock-pulse');
  await expect(page.locator('#black-ready')).toHaveCSS('animation-name', 'ready-pop');
});

test('solo match replaces start with resign until the match ends', async ({ page }) => {
  await page.goto('/playroom/');
  const homeDoor = await page.locator('.playroom-home').boundingBox();
  await page.goto('/playroom/omokmaru/solo/');
  await expect(page.locator('.top')).toHaveCount(0);
  await expect(page.locator('.stage-mast .door-control')).toHaveAttribute('href', '/playroom/omokmaru/');
  const soloDoor = await page.locator('.stage-mast .door-control').boundingBox();
  expect(Math.abs(soloDoor!.x - homeDoor!.x)).toBeLessThan(1);
  expect(Math.abs(soloDoor!.y - homeDoor!.y)).toBeLessThan(1);
  await expect(page.locator('.stage-mast h1')).toHaveCount(0);
  await expect(page.locator('.side > .side-title')).toHaveText('Omokmaru');
  const side = await page.locator('.side').boundingBox();
  const title = await page.locator('.side-title').boundingBox();
  expect(Math.abs(title!.x + title!.width / 2 - (side!.x + side!.width / 2))).toBeLessThan(1);
  const firstTool = await page.locator('.toolbar button').first().boundingBox();
  expect(Math.abs(firstTool!.y + firstTool!.height / 2 - (soloDoor!.y + soloDoor!.height / 2))).toBeLessThan(1);
  await expect(page.locator('#start')).toHaveText('대국 시작');
  await page.locator('#start').click();
  await expect(page.locator('#start')).toBeHidden();
  await expect(page.locator('#resign-solo')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('#resign-solo').click();
  await expect(page.locator('#start')).toHaveText('다시 대국');
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#resign-solo')).toBeHidden();
  await expect(page.locator('#replay')).toBeVisible();
});

test('desktop board click places a stone immediately', async ({ page }) => {
  await page.goto('/playroom/omokmaru/solo/');
  await page.locator('#side-white').click();
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#start').click();
  const canvas = page.locator('.canvas canvas');
  const box = await canvas.boundingBox();
  const neighbor = { x: box!.width / 2 + 42, y: box!.height / 2 };
  await expect(page.locator('#canvas')).toHaveAttribute('data-rendered-moves', '1');
  await expect(page.locator('#move-confirm')).toBeHidden();
  await expect(page.locator('#undo')).toBeHidden();
  await canvas.click({ position: neighbor });
  await expect(page.locator('#undo')).toBeVisible();
  await expect(page.locator('#move-confirm')).toBeHidden();
});

test('solo board renders the AI reply after the player move', async ({ page }) => {
  await page.goto('/playroom/omokmaru/solo/');
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#start').click();
  await expect(page.locator('#canvas')).toHaveAttribute('data-rendered-moves', '2');
  const canvas = page.locator('.canvas canvas');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#canvas')).toHaveAttribute('data-rendered-moves', '4');
  await page.locator('#undo').click();
  await expect(page.locator('#canvas')).toHaveAttribute('data-rendered-moves', '2');
});

test('Omokmaru sound setting persists between visits', async ({ page }) => {
  await page.goto('/playroom/omokmaru/solo/');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound').click();
  await page.reload();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard can inspect coordinates and place a solo move', async ({ page }) => {
  await page.goto('/playroom/omokmaru/solo/');
  await page.locator('#side-white').click();
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#start').click();
  const canvas = page.locator('.canvas canvas');
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#board-keyboard-status')).toContainText('J8');
  await page.keyboard.press('Enter');
  await expect(page.locator('#undo')).toBeVisible();
});

test('small solo screen returns to the board when play starts', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 568 } });
  const page = await context.newPage();
  try {
    await page.goto('/playroom/omokmaru/solo/');
    await page.locator('#side-white').click();
    await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    await expect(page.locator('#stage-hint')).toContainText('내 차례');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    for (const button of await page.locator('.toolbar button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    }
  } finally {
    await context.close();
  }
});

test('small online room keeps its controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/playroom/omokmaru/');
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#lobby')!.hidden = true;
    document.querySelector<HTMLElement>('#game')!.hidden = false;
    document.querySelector<HTMLElement>('#room-setup')!.hidden = false;
    document.querySelector<HTMLElement>('#settings')!.hidden = false;
    document.querySelector<HTMLElement>('#ready')!.hidden = false;
    document.querySelector<HTMLElement>('#black-name')!.textContent = 'VeryLongPlayerName123456789';
    document.querySelector<HTMLElement>('#white-name')!.textContent = 'AnotherLongPlayerName123456';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const ready = await page.locator('#ready').boundingBox();
  expect(ready!.x + ready!.width).toBeLessThanOrEqual(320);
});

test('touch board tap previews a stone until the move button confirms it', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto('/playroom/omokmaru/solo/');
    await page.locator('#difficulty').selectOption('easy');
    await page.locator('#start').click();
    const box = await page.locator('.canvas canvas').boundingBox();
    const neighbor = { x: box!.x + box!.width / 2 + 20, y: box!.y + box!.height / 2 };
    await page.touchscreen.tap(neighbor.x, neighbor.y);
    await expect(page.locator('#place-label')).toHaveText(/착수/);
    await expect(page.locator('#undo')).toBeHidden();
    await page.locator('#cancel-move').click();
    await expect(page.locator('#move-confirm')).toBeHidden();
    await page.touchscreen.tap(neighbor.x, neighbor.y);
    await page.locator('#place-move').click();
    await expect(page.locator('#undo')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('Omokmaru guest name can be edited and survives a reload', async ({ page }) => {
  await page.goto('/playroom/omokmaru/');
  await page.locator('#rename-lobby').click();
  await page.locator('#name-input').fill('ab');
  await page.locator('#name-form button[type="submit"]').click();
  await expect(page.locator('#name-error')).toContainText('3~30자');
  await page.locator('#name-input').fill('NimbleFox');
  await page.locator('#name-form button[type="submit"]').click();
  await expect(page.locator('#name-dialog')).toBeHidden();
  await expect(page.locator('#guest-name')).toHaveText('NimbleFox');
  await page.reload();
  await expect(page.locator('#guest-name')).toHaveText('NimbleFox');
});

test('old playroom invitations keep their room when redirected to Omokmaru', async ({ page }) => {
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => navigations.push(frame.url()));
  await page.goto('/playroom/?room=old-room');
  await expect.poll(() => navigations.some((url) => /\/playroom\/omokmaru\/\?room=old-room$/.test(url))).toBe(true);
});

test('old Gomoku links redirect to Omokmaru with their room', async ({ page }) => {
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => navigations.push(frame.url()));
  await page.goto('/playroom/gomoku/?room=old-room');
  await expect.poll(() => navigations.some((url) => /\/playroom\/omokmaru\/\?room=old-room$/.test(url))).toBe(true);
  await page.goto('/playroom/gomoku/solo/');
  await expect(page).toHaveURL(/\/playroom\/omokmaru\/solo\/$/);
});

test('blog sidebar home and posts links stay inside the blog', async ({ page }) => {
  await page.goto('/blog/');

  await expect(page.locator('.site-header nav a[href="/blog/"] span')).toHaveText('Home');
  await expect(page.locator('.site-header nav a[href="/blog/posts/"] span')).toHaveText('Posts');
  await expect(page.locator('.site-header nav a[href="/guestbook/"]')).toHaveCount(0);

  await page.goto('/blog/posts/');
  await expect(page.locator('.site-header nav a[href="/blog/"]')).not.toHaveClass(/is-current/);
  await expect(page.locator('.site-header nav a[href="/blog/posts/"]')).toHaveClass(/is-current/);
});

test('page opacity fade remains available when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/blog/categories/Algorithm/');

  await expect(page.locator('.site-content')).toHaveCSS('animation-name', 'page-content-reveal');
  await expect(page.locator('.site-frame')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.page-loader__rule')).toHaveCSS('animation-name', 'none');
});

test('top scroll progress tracks the full document scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  const progress = page.locator('[data-scroll-progress]');
  const fill = progress.locator('.scroll-progress__fill');
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await expect(progress).toHaveCSS('position', 'fixed');
  await expect(progress).toHaveCSS('overflow', 'hidden');
  await expect(fill).toHaveCSS('position', 'absolute');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(progress).toHaveAttribute('aria-valuenow', '100');
});

test('archive cards link to articles with clean slugs', async ({ page }) => {
  await page.goto('/blog/posts/');

  const firstPost = page.locator('.post-card').first();
  await expect(firstPost).toBeVisible();
  await expect(firstPost.locator('h3 a')).toHaveAttribute('href', /^\/blog\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/);
});

test('all posts are paginated in groups of ten', async ({ page }) => {
  await page.goto('/blog/posts/');
  await expect(page.locator('.post-card')).toHaveCount(10);
  await expect(page.locator('[data-pagination] [aria-current="page"]')).toHaveText('1');
  await expect(page.locator('[data-pagination]')).toHaveCSS('justify-content', 'center');
  await expect(page.locator('[data-pagination] [data-pagination-first]')).toHaveCount(0);
  await expect(page.locator('[data-pagination] [data-pagination-prev]')).toHaveCount(0);
  await expect(page.locator('[data-pagination] a[rel="next"]')).toHaveAttribute('href', '/blog/posts/2/');

  // Read the last page off the control instead of hardcoding it, so publishing
  // another post does not fail the test.
  const pageLabels = await page.locator('[data-pagination] .pagination__pages > *').allTextContents();
  const lastPage = Number(pageLabels.at(-1));
  expect(lastPage).toBeGreaterThan(2);
  await expect(page.locator('[data-pagination] a[data-pagination-last]')).toHaveAttribute(
    'href',
    `/blog/posts/${lastPage}/`,
  );

  await page.goto('/blog/posts/2/');
  await expect(page.locator('.post-card')).toHaveCount(10);
  await expect(page.locator('[data-pagination] [aria-current="page"]')).toHaveText('2');
  await expect(page.locator('[data-pagination] a[data-pagination-first]')).toHaveAttribute('href', '/blog/posts/');
  await expect(page.locator('[data-pagination] a[data-pagination-first] svg')).toHaveCount(1);
  await expect(page.locator('[data-pagination] a[rel="prev"]')).toHaveAttribute('href', '/blog/posts/');
  await expect(page.locator('[data-pagination] a[data-pagination-prev] svg')).toHaveCount(1);
  await expect(page.locator('[data-pagination] a[rel="next"]')).toHaveAttribute('href', '/blog/posts/3/');
  await expect(page.locator('[data-pagination] a[data-pagination-next] svg')).toHaveCount(1);
  await expect(page.locator('[data-pagination] a[data-pagination-last]')).toHaveAttribute(
    'href',
    `/blog/posts/${lastPage}/`,
  );
  await expect(page.locator('[data-pagination] a[data-pagination-last] svg')).toHaveCount(1);

  await page.goto(`/blog/posts/${lastPage}/`);
  const remainder = await page.locator('.post-card').count();
  expect(remainder).toBeGreaterThan(0);
  expect(remainder).toBeLessThanOrEqual(10);
  await expect(page.locator('[data-pagination] [aria-current="page"]')).toHaveText(String(lastPage));
  await expect(page.locator('[data-pagination] a[rel="prev"]')).toHaveAttribute('href', `/blog/posts/${lastPage - 1}/`);
  await expect(page.locator('[data-pagination] a[data-pagination-first]')).toHaveAttribute('href', '/blog/posts/');
  await expect(page.locator('[data-pagination] [data-pagination-next]')).toHaveCount(0);
  await expect(page.locator('[data-pagination] [data-pagination-last]')).toHaveCount(0);
});

test('category lists over ten posts are paginated too', async ({ page }) => {
  await page.goto('/blog/categories/Study/');
  await expect(page.locator('.post-card')).toHaveCount(10);
  await expect(page.locator('[data-pagination] a[rel="next"]')).toHaveAttribute('href', '/blog/categories/Study/2/');

  await page.goto('/blog/categories/Study/2/');
  const overflow = await page.locator('.post-card').count();
  expect(overflow).toBeGreaterThan(0);
  expect(overflow).toBeLessThanOrEqual(10);
  await expect(page.locator('[data-pagination] a[rel="prev"]')).toHaveAttribute('href', '/blog/categories/Study/');
  await expect(page.locator('[data-pagination]')).toHaveCSS('justify-content', 'center');
});

test('short pages fill at least the viewport height', async ({ page }) => {
  // Independent spaces render through the main-space layout, which has its own
  // filling container rather than the blog shell's .site-content.
  const shortPages = [
    { route: '/about/', container: '.main-space-page' },
    { route: '/blog/categories/', container: '.site-content' },
    { route: '/guestbook/', container: '.site-content' },
    { route: '/blog/posts/3/', container: '.site-content' },
  ];

  for (const { route, container } of shortPages) {
    await page.goto(route);
    expect(
      await page.locator(container).evaluate((element) => element.getBoundingClientRect().height >= window.innerHeight),
      route,
    ).toBe(true);
  }
});

test('sidebar keeps tools and reading controls in their intended locations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/');

  const sidebar = page.locator('.site-header');
  const controls = sidebar.locator('.site-header__controls');
  const themeToggle = controls.locator('[data-theme-toggle]');
  const focusToggle = controls.locator('[data-focus-mode]');
  const searchButton = controls.locator('[data-search-open]');

  await expect(sidebar.locator('nav a[href="/blog/tools/markdown-viewer/?home=1"]')).toHaveText('Markdown Viewer');
  await expect(sidebar.locator('nav a[href="/guestbook/"]')).toHaveCount(0);
  await expect(controls).toBeVisible();
  await expect(searchButton.locator('[data-search-icon="dark"]')).toBeVisible();
  await expect(searchButton.locator('.site-header__control-hint')).toHaveText('검색 열기');
  await expect(searchButton.locator('kbd')).toHaveCount(0);
  await expect(themeToggle).toBeVisible();
  await expect(themeToggle.locator('.site-header__control-hint')).toHaveText('라이트 테마로 전환');
  await expect(themeToggle.locator('[data-theme-icon="sun"]')).toBeVisible();
  await expect(themeToggle.locator('[data-theme-icon="moon"]')).toBeHidden();
  await expect(focusToggle).toBeVisible();
  await expect(focusToggle.locator('.site-header__control-hint')).toHaveText('집중해서 보기');
  await expect(controls).toHaveCSS('justify-content', 'space-between');

  const [sidebarBottom, controlsBottom] = await Promise.all([sidebar.boundingBox(), controls.boundingBox()]);
  expect(sidebarBottom).not.toBeNull();
  expect(controlsBottom).not.toBeNull();
  expect(controlsBottom!.y + controlsBottom!.height).toBeGreaterThan(sidebarBottom!.y + sidebarBottom!.height - 120);

  const [searchBox, themeBox, focusBox] = await Promise.all([
    searchButton.boundingBox(),
    themeToggle.boundingBox(),
    focusToggle.boundingBox(),
  ]);
  expect(searchBox).not.toBeNull();
  expect(themeBox).not.toBeNull();
  expect(focusBox).not.toBeNull();
  expect(themeBox!.x).toBeLessThan(focusBox!.x);
  expect(focusBox!.x).toBeLessThan(searchBox!.x);

  await page.locator('[data-feature-toggle]').click();
  await expect(page.locator('[data-feature-panel]')).toBeVisible();
  await expect(page.locator('[data-feature-toggle]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-feature-panel]')).toHaveText('To be Continue');
  await expect(page.locator('[data-feature-panel] [data-theme-toggle]')).toHaveCount(0);
  await expect(page.locator('[data-feature-panel] [data-focus-mode]')).toHaveCount(0);
  await expect(themeToggle.locator('img[data-theme-icon="sun"]')).toHaveAttribute('src', '/images/theme-sun.png');
  await expect(themeToggle.locator('img[data-theme-icon="moon"]')).toHaveAttribute(
    'src',
    '/images/theme-moon-dark.png',
  );
  expect(
    await themeToggle
      .locator('img[data-theme-icon="moon"]')
      .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await expect(themeToggle.locator('[data-theme-icon="moon"]')).toBeHidden();
  await expect(themeToggle.locator('[data-theme-icon="sun"]')).toBeVisible();
  await expect(themeToggle.locator('[data-theme-icon="moon"]')).toHaveCSS('width', '28px');
  await expect(searchButton.locator('[data-search-icon="dark"]')).toHaveAttribute(
    'src',
    '/images/search-eye-dark-embroidered.png',
  );

  await searchButton.click();
  await expect(page.locator('[data-search-modal]')).toBeVisible();
  await expect(page.locator('.search-modal .pagefind-ui__search-input')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-search-modal]')).toBeHidden();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(themeToggle).toHaveAttribute('aria-checked', 'true');
  await expect(themeToggle.locator('.site-header__control-hint')).toHaveText('다크 테마로 전환');
  await expect(themeToggle.locator('[data-theme-icon="moon"]')).toBeVisible();
  await expect(themeToggle.locator('[data-theme-icon="sun"]')).toBeHidden();
  await expect(searchButton.locator('[data-search-icon="light"]')).toBeVisible();
});

test('focus mode keeps a lower-left exit control visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  await page.locator('[data-focus-mode]').click();
  await expect(page.locator('html')).toHaveAttribute('data-focus-mode', '');
  await expect(page.locator('.site-header')).toBeHidden();

  const exitButton = page.locator('[data-focus-exit]');
  await expect(exitButton).toBeVisible();
  await expect(exitButton).toHaveAttribute('title', '집중 보기 종료');
  const exitBox = await exitButton.boundingBox();
  expect(exitBox).not.toBeNull();
  expect(exitBox!.x).toBeLessThan(48);
  expect(exitBox!.y).toBeGreaterThan(780);

  await exitButton.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-focus-mode');
  await expect(page.locator('.site-header')).toBeVisible();
});

test('home search opens the modal with the typed query', async ({ page }) => {
  await page.goto('/blog/');

  await page.locator('[data-home-search-input]').fill('git');
  await page.locator('[data-home-search-form]').press('Enter');

  await expect(page.locator('[data-search-modal]')).toBeVisible();
  await expect(page.locator('.search-modal .pagefind-ui__search-input')).toHaveValue('git');
});

test('article shows a wide mobile TOC below the header', async ({ page }) => {
  await page.goto('/blog/posts/git-reset-vs-git-revert/');

  const desktopToc = page.locator('.article__desktop-toc .table-of-contents__desktop');
  const desktopRail = page.locator('.article__desktop-toc');
  await expect(desktopToc).toBeVisible();
  await expect(desktopRail).toHaveCSS('position', 'fixed');
  await expect(page.locator('.article__desktop-toc details.table-of-contents__mobile')).toBeHidden();

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(desktopToc).toBeHidden();
  await expect(page.locator('.article__mobile-toc .table-of-contents__desktop')).toBeHidden();
  await expect(page.locator('.article__mobile-toc details.table-of-contents__mobile')).toBeVisible();
});

test('article initial load does not inject a TOC hash or jump the scroll position', async ({ page }) => {
  await page.goto('/blog/posts/macos-space/');
  await page.waitForTimeout(300);

  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('long desktop TOC scrolls independently within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/blog/posts/macos-space/');

  const toc = page.locator('.article__desktop-toc .table-of-contents__desktop');
  await toc.hover();
  await expect(toc).toHaveCSS('overflow-y', 'auto');
  const metrics = await toc.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(metrics.height).toBeLessThanOrEqual(700 - 64);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
});

test('sidebar and desktop TOC keep their top offsets when scrolling begins', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  const sidebar = page.locator('.site-header');
  const toc = page.locator('.article__desktop-toc .table-of-contents__desktop');
  const initial = {
    sidebarTop: (await sidebar.boundingBox())!.y,
    tocTop: (await toc.boundingBox())!.y,
  };

  await page.evaluate(() => window.scrollTo(0, 1800));

  expect((await sidebar.boundingBox())!.y).toBe(initial.sidebarTop);
  expect((await toc.boundingBox())!.y).toBe(initial.tocTop);
});

test('desktop TOC aligns to the right edge of the content viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  const toc = await page.locator('.article__desktop-toc').boundingBox();
  const article = await page.locator('.article').boundingBox();
  const content = await page.locator('.site-content').boundingBox();
  expect(toc).not.toBeNull();
  expect(article).not.toBeNull();
  expect(content).not.toBeNull();
  // The shell reserves the TOC column, its gap and the edge inset on the right,
  // then centres the article in what is left. Resolve that reservation from the
  // stylesheet so the test states the layout rule instead of a measured number
  // that drifts whenever the rail's own width changes.
  const widthOf = (expression: string) =>
    page.locator('.article-shell').evaluate((element, value) => {
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.width = value;
      element.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    }, expression);

  const edgeInset = await widthOf('var(--toc-edge-inset)');
  const reserved = await widthOf('calc(var(--toc-column-width) + var(--toc-gap) + var(--toc-edge-inset))');

  expect(toc!.x + toc!.width).toBe(content!.x + content!.width - edgeInset);
  const articleRegionRight = content!.x + content!.width - reserved;
  expect(Math.abs(article!.x + article!.width / 2 - (content!.x + articleRegionRight) / 2)).toBeLessThan(1);
  // Independent of those tokens: the rail must never crowd or overlap the prose.
  expect(toc!.x - (article!.x + article!.width)).toBeGreaterThan(0);
});

test('desktop article and TOC keep a breathing gap near the layout breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  const article = await page.locator('.article').boundingBox();
  const toc = await page.locator('.article__desktop-toc').boundingBox();
  expect(article).not.toBeNull();
  expect(toc).not.toBeNull();
  expect(toc!.x - (article!.x + article!.width)).toBeGreaterThanOrEqual(32);
});

test('desktop TOC starts as a rail and expands on hover', async ({ page }) => {
  for (const width of [1240, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/blog/posts/macos-space/');

    const article = page.locator('.article');
    const toc = page.locator('.article__desktop-toc');
    const tocList = toc.locator('.table-of-contents__desktop > ol');
    const collapsedWidth = (await article.boundingBox())!.width;

    await expect(toc).toHaveAttribute('data-toc-collapsed');
    await expect(toc).toBeVisible();
    await expect(toc.locator('.table-of-contents__collapsed-preview')).toBeVisible();
    await expect(toc.locator('[data-toc-preview]')).toHaveCount(
      await page
        .locator('.article__desktop-toc a')
        .evaluateAll(
          (links) =>
            new Set(
              links
                .filter((link) => link.closest('li')?.className.includes('depth-2'))
                .map((link) => link.getAttribute('href')),
            ).size,
        ),
    );
    await expect(tocList).toBeHidden();

    await toc.locator('.table-of-contents__desktop').hover();
    await expect(tocList).toBeVisible();
    await expect.poll(async () => (await article.boundingBox())!.width).toBe(collapsedWidth);
    await expect.poll(async () => (await toc.boundingBox())!.width).toBeGreaterThan(40);

    await page.locator('.article h1').hover();
    await expect(tocList).toBeHidden();
    await expect.poll(async () => (await article.boundingBox())!.width).toBe(collapsedWidth);
  }
});

test('the 900px breakpoint uses the wide mobile TOC', async ({ page }) => {
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/blog/posts/macos-space/');

    await expect(page.locator('.site-frame')).toHaveCSS('display', 'block');
    expect((await page.locator('.site-header').boundingBox())!.height).toBeLessThan(200);
    await expect(page.locator('.site-header nav')).toHaveCSS('flex-direction', 'row');
    await expect(page.locator('.site-header nav')).toHaveCSS('justify-content', 'space-between');
    await expect(page.locator('.article__desktop-toc')).toBeHidden();
    await expect(page.locator('.article__mobile-toc .table-of-contents__mobile')).toBeVisible();
    await expect(page.locator('[data-toc-top-toggle]')).toBeHidden();
  }
});

test('blog navigation hides on downward scroll and returns on upward scroll', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  const header = page.locator('.site-header');
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(header).toHaveAttribute('data-scroll-hidden');

  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(header).not.toHaveAttribute('data-scroll-hidden');
});

test('sidebar mode keeps the left sidebar fixed while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  const sidebar = page.locator('.site-header');
  const initial = await sidebar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, 500));

  await expect(sidebar).not.toHaveAttribute('data-scroll-hidden');
  const scrolled = await sidebar.boundingBox();
  expect(scrolled).not.toBeNull();
  expect(scrolled!.y).toBe(initial!.y);
});

test('desktop TOC updates its active color and URL hash as headings pass', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/posts/git-reset-vs-git-revert/');

  await page.locator('#특징').evaluate((heading) => {
    const top = heading.getBoundingClientRect().top + window.scrollY - 40;
    window.scrollTo(0, top);
  });

  const activeLink = page.locator('.article__desktop-toc nav a[href="#특징"]');
  const inactiveLink = page.locator('.article__desktop-toc nav a[href="#git-revert"]');
  const parentLink = page.locator('.article__desktop-toc nav a[href="#git-reset"]');
  await expect(activeLink).toHaveAttribute('aria-current', 'location');
  await expect(parentLink).toHaveAttribute('aria-current', 'location');
  await expect.poll(() => page.evaluate(() => decodeURIComponent(window.location.hash))).toBe('#특징');
  expect(await activeLink.evaluate((link) => getComputedStyle(link).color)).not.toBe(
    await inactiveLink.evaluate((link) => getComputedStyle(link).color),
  );
  await expect(page.locator('.article__desktop-toc [data-toc-preview="git-reset"]')).toHaveAttribute('data-active');
  await expect(page.locator('.article__desktop-toc [data-toc-preview="특징"]')).toHaveCount(0);
});

test('clicking a heading keeps that heading active until the next heading passes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/posts/macos-space/');

  // The desktop rail stays collapsed to zero width until it is hovered, so a
  // click has to follow the same path a reader takes.
  await page.locator('.article__desktop-toc').hover();
  await page.locator('.article__desktop-toc nav a[href="#5-recovery-mode에서-sip-부분-해제하기"]').click();

  await expect(
    page.locator('.article__desktop-toc nav a[href="#5-recovery-mode에서-sip-부분-해제하기"]'),
  ).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('.article__desktop-toc nav a[href="#왜-필요한가"]')).not.toHaveAttribute(
    'aria-current',
    'location',
  );
});

test('article metadata keeps the publication date in Asia/Seoul', async ({ page }) => {
  await page.goto('/blog/posts/macos-xcrun-error-invalied-active-developer-path/');

  await expect(page.locator('.article-meta time')).toHaveText('2022년 12월 2일');
});

test('narrow articles do not create document-level horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });

  for (const slug of [
    'database-erd-quickdbd-erd-drawing',
    'macos-xcrun-error-invalied-active-developer-path',
    'python-django-aws-ec-github',
  ]) {
    await page.goto(`/blog/posts/${slug}/`);
    expect(await page.locator('html').evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true);
  }

  const codeBlock = page.locator('pre').first();
  await expect(codeBlock).toHaveCSS('overflow-x', 'auto');
  expect(await codeBlock.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('long code stays horizontally scrollable inside its shell', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/blog/posts/telegram-bot/');

  const shell = page.locator('.code-shell').first();
  const codePanel = shell.locator('pre');
  const customScrollbar = shell.locator('.code-shell__scrollbar');
  const customThumb = customScrollbar.getByRole('scrollbar');

  await expect(codePanel).toHaveCSS('overflow-x', 'auto');
  await expect(codePanel).toHaveCSS('overscroll-behavior-x', 'contain');
  expect(await codePanel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(customScrollbar).toBeVisible();
  await expect(customThumb).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(customThumb).toHaveAttribute('aria-valuenow', '0');

  await customThumb.focus();
  await page.keyboard.press('End');

  await expect(customThumb).toHaveAttribute('aria-valuenow', '100');
  expect(
    await codePanel.evaluate((element) => Math.round(element.scrollLeft + element.clientWidth) === element.scrollWidth),
  ).toBe(true);

  await page.keyboard.press('Home');
  const thumbBox = await customThumb.boundingBox();
  const trackBox = await customScrollbar.locator('.code-shell__scrollbar-track').boundingBox();
  expect(thumbBox).not.toBeNull();
  expect(trackBox).not.toBeNull();

  await page.mouse.move(thumbBox!.x + thumbBox!.width / 2, thumbBox!.y + thumbBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(trackBox!.x + trackBox!.width - 2, thumbBox!.y + thumbBox!.height / 2);
  await page.mouse.up();

  expect(await codePanel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('html').evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true);
});

test('short markdown tables fit their content instead of stretching to the article width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/blog/posts/telegram-bot/');

  const content = await page.locator('.article__content').boundingBox();
  const table = page.locator('.article__content table').first();
  const tableBox = await table.boundingBox();

  expect(content).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(tableBox!.width).toBeLessThan(content!.width);
});

test('markdown code blocks show a shell marker and individually dismissible copy confirmations', async ({ page }) => {
  await page.goto('/blog/posts/telegram-bot/');

  const shell = page.locator('.code-shell').first();
  await expect(shell.locator('.code-shell__marker')).toHaveText('>_');

  const copyButton = shell.getByRole('button', { name: 'Copy code' });
  await copyButton.click();
  await copyButton.click();

  const toasts = page.locator('.code-copy-toast');
  await expect(toasts).toHaveCount(2);
  await expect(toasts.first()).toHaveText(/Copied to clipboard/);
  await expect(toasts.first()).toHaveCSS('animation-name', 'code-copy-toast-rise');

  await toasts.first().getByRole('button', { name: 'Dismiss copy confirmation' }).click();
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toHaveCount(0, { timeout: 3500 });
});

test('code shells use theme-specific textured surfaces', async ({ page }) => {
  await page.goto('/blog/posts/telegram-bot/');

  const shell = page.locator('.code-shell').first();
  const codePanel = shell.locator('pre');
  const shellHeader = shell.locator('.code-shell__header');
  const darkSurface = await shell.evaluate((element) => ({
    color: getComputedStyle(element).backgroundColor,
    texture: getComputedStyle(element, '::before').backgroundImage,
    textureBlend: getComputedStyle(element, '::before').backgroundBlendMode,
    textureColor: getComputedStyle(element, '::before').backgroundColor,
    textureOpacity: getComputedStyle(element, '::before').opacity,
  }));

  const darkShellToken = await themeColor(page, '--color-code-shell');

  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'light';
  });

  const lightSurface = await shell.evaluate((element) => ({
    color: getComputedStyle(element).backgroundColor,
    texture: getComputedStyle(element, '::before').backgroundImage,
    textureBlend: getComputedStyle(element, '::before').backgroundBlendMode,
    textureColor: getComputedStyle(element, '::before').backgroundColor,
    textureOpacity: getComputedStyle(element, '::before').opacity,
  }));

  expect(darkSurface.color).not.toBe(lightSurface.color);
  expect(darkSurface.texture).not.toBe('none');
  expect(darkSurface.texture).toContain('code-shell-texture.webp');
  expect(darkSurface.textureBlend).toContain('luminosity');
  expect(darkSurface.textureColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(darkSurface.textureOpacity).toBe('0.72');
  expect(darkSurface.color).toBe(darkShellToken);
  expect(lightSurface.texture).not.toBe(darkSurface.texture);
  expect(lightSurface.textureColor).not.toBe(darkSurface.textureColor);
  // Assert against the theme tokens: the rule is that the shell paints itself
  // from the palette, not that the palette holds one particular colour.
  expect(lightSurface.color).toBe(await themeColor(page, '--color-code-shell'));
  expect(lightSurface.texture).toContain('light-code-shell-texture-v2.webp');
  expect(lightSurface.textureBlend).toContain('multiply');
  // Light surfaces carry a lighter texture than dark ones; both values are
  // declared on the ::before layer in editorial-surfaces.css.
  expect(lightSurface.textureOpacity).toBe('0.52');
  await expect(codePanel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(codePanel).toHaveCSS('color', await themeColor(page, '--color-text'));
  await expect(shellHeader).toHaveCSS('background-color', await themeColor(page, '--color-code-shell-header'));
  const customThumb = shell.locator('.code-shell__scrollbar-thumb');
  const lightScrollbar = await customThumb.evaluate((element) => ({
    color: getComputedStyle(element).backgroundColor,
    texture: getComputedStyle(element, '::before').backgroundImage,
  }));
  expect(lightScrollbar.texture).toContain('light-code-shell-texture-v2.webp');

  await page.locator('html').evaluate((element) => {
    element.dataset.theme = 'midnight';
  });

  const darkScrollbar = await customThumb.evaluate((element) => ({
    color: getComputedStyle(element).backgroundColor,
    texture: getComputedStyle(element, '::before').backgroundImage,
  }));
  expect(darkScrollbar.color).not.toBe(lightScrollbar.color);
  expect(darkScrollbar.texture).toContain('code-shell-texture.webp');
  const headerTexture = await shellHeader.evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
  expect(headerTexture).toContain('code-shell-texture.webp');
  expect(await shellHeader.evaluate((element) => getComputedStyle(element, '::before').backgroundPosition)).not.toBe(
    await shell.evaluate((element) => getComputedStyle(element, '::before').backgroundPosition),
  );
});

test('table and code headers share one textured surface in both themes', async ({ page }) => {
  await page.goto('/blog/posts/telegram-bot/');

  const tableHeader = page.locator('.article__content thead').first();
  const codeHeader = page.locator('.article__content .code-shell__header').first();

  for (const theme of ['midnight', 'light']) {
    await page.locator('html').evaluate((element, nextTheme) => {
      element.dataset.theme = nextTheme;
    }, theme);

    const readHeaderSurface = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const texture = getComputedStyle(element, '::before');

      return {
        backgroundColor: style.backgroundColor,
        content: texture.content,
        image: texture.backgroundImage,
        blend: texture.backgroundBlendMode,
        opacity: texture.opacity,
        position: texture.backgroundPosition,
        repeat: texture.backgroundRepeat,
        size: texture.backgroundSize,
        filter: texture.filter,
      };
    };

    const tableSurface = await tableHeader.evaluate(readHeaderSurface);
    const codeSurface = await codeHeader.evaluate(readHeaderSurface);

    expect(tableSurface.content).toBe('""');
    expect(tableSurface.image).toContain(
      theme === 'light' ? 'light-code-shell-texture-v2.webp' : 'code-shell-texture.webp',
    );
    expect(tableSurface.blend).toContain(theme === 'light' ? 'multiply' : 'luminosity');
    expect(tableSurface.repeat).toContain('repeat');
    expect(tableSurface.size).toContain('576px');
    expect(tableSurface.backgroundColor).toBe(await themeColor(page, '--color-code-shell-header'));

    // Light code shells were pulled back onto the shared table surface, so the
    // two headers must stay indistinguishable in every theme.
    expect(codeSurface).toEqual(tableSurface);
  }

  await expect(tableHeader.locator('th').first()).toHaveCSS('background-image', 'none');
});

test('TOC omits headings without a target or label', async ({ page }) => {
  await page.goto('/blog/posts/algorithm-java-swea/');

  await expect(page.locator('.table-of-contents__desktop a[href="#"]')).toHaveCount(0);
  const labels = await page.locator('.table-of-contents__desktop a').allTextContents();
  expect(labels.every((label) => label.trim().length > 0)).toBe(true);
});
