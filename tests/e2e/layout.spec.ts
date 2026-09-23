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

/**
 * 절대 오프셋으로 즉시 스크롤한 뒤, 스크롤 기반 애니메이션이 새 진행도로
 * 정착하도록 두 프레임 기다린다. 합성 스레드에서 도는 애니메이션이라
 * 스크롤 직후 한 프레임 동안은 이전 값이 읽힌다.
 */
const scrollTo = async (page: Page, top: number) => {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), top);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
};

/** 요소가 지금 계산된 불투명도. */
const opacityOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => parseFloat(getComputedStyle(element).opacity));

test('splash shows the whole book on one screen, without a script', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // 스크롤 스크립트가 심던 상태가 어디에도 없다.
  await expect(
    page.locator('[data-enhanced], [data-chapter-locked], [data-chapter-visible], [data-cover-ready]'),
  ).toHaveCount(0);

  // 표지와 낱장이 한 화면에 함께 있다. 스크롤할 것이 남지 않는다.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

  for (const selector of ['.book-splash__crest', '.book-splash__title-glyph', '.book-splash__tagline']) {
    await expect(page.locator(selector)).toBeInViewport();
    expect(await opacityOf(page, selector)).toBeCloseTo(1, 2);
  }
  for (const chapter of splashChapters) {
    await expect(page.locator(`a.splash-leaf#${chapter.id}`)).toBeInViewport();
  }

  // 문장 · 워드마크 · 태그라인은 한 덩어리로 붙고, 낱장과는 그보다 벌어진다.
  const gaps = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const crest = box('.book-splash__crest');
    const mark = box('.book-splash__title-glyph');
    const tagline = box('.book-splash__tagline');
    return {
      crestTop: crest.top,
      crestToMark: mark.top - crest.bottom,
      markToTagline: tagline.top - mark.bottom,
      taglineToLeaf: box('a.splash-leaf#journal').top - tagline.bottom,
    };
  });
  expect(gaps.crestTop).toBeLessThan(120);
  expect(gaps.crestToMark).toBeLessThan(40);
  expect(gaps.markToTagline).toBeLessThan(40);
  expect(gaps.taglineToLeaf).toBeGreaterThan(gaps.markToTagline);
});

test('splash lays every chapter out as one row of leaves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const leaves = page.locator('.splash-sheaf .splash-leaf');
  await expect(leaves).toHaveCount(splashChapters.length);

  const boxes = await leaves.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, width: box.width };
    }),
  );

  for (const box of boxes) expect(box.width).toBeGreaterThan(40);
  // 한 줄이다: 모든 낱장의 윗변이 같은 높이에 있다.
  for (const box of boxes) expect(Math.abs(box.top - boxes[0].top)).toBeLessThanOrEqual(1);
  // 왼쪽에서 오른쪽으로 순서대로 놓인다.
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].left).toBeGreaterThan(boxes[index - 1].left);
  }
});

test('splash leaves lean the same way and overlap their neighbour', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const lap = await page
    .locator('.splash-sheaf')
    .evaluate((element) => parseFloat(getComputedStyle(element).getPropertyValue('--leaf-lap')));
  expect(lap).toBeGreaterThan(0);

  const boxes = await page
    .locator('.splash-sheaf .splash-leaf')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect()).map((b) => [b.left, b.right]),
    );

  // 이웃한 낱장은 --leaf-lap 만큼 겹친다.
  for (let index = 1; index < boxes.length; index += 1) {
    const overlap = boxes[index - 1][1] - boxes[index][0];
    expect(Math.abs(overlap - lap)).toBeLessThanOrEqual(1);
  }

  // 모든 낱장이 같은 방향으로 기운다: clip-path 가 오른쪽으로 좁아지는 사다리꼴이다.
  const shapes = await page
    .locator('.splash-sheaf .splash-leaf')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).clipPath));
  for (const shape of shapes) {
    expect(shape).toContain('polygon');
    expect(shape).toBe(shapes[0]);
  }

  // 뒤 낱장이 앞 낱장 위에 그려진다: z-index 를 쓰지 않고 문서 순서로.
  const stacking = await page
    .locator('.splash-sheaf .splash-leaf')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).zIndex));
  for (const value of stacking) expect(value).toBe('auto');

  // 기울기는 변수가 아니라 실제로 계산된 폴리곤에서 읽어야 한다.
  // --leaf-tilt 를 읽으면 규칙이 그 변수를 쓰는지 여부를 검사하지 못한다.
  // 계산된 clip-path 는 px/%/calc() 가 섞여 직렬화되므로(예: "polygon(0px 0px, 100%
  // 17px, 100% calc(100% - 17px), 0px 100%)"), 각 점의 y 성분을 DOM 으로 실제
  // 해석해 픽셀 값을 얻는다.
  const resting = await page.locator('a.splash-leaf#journal').evaluate((element) => {
    const height = element.getBoundingClientRect().height;
    const clip = getComputedStyle(element).clipPath;
    const points = clip.slice(clip.indexOf('(') + 1, clip.lastIndexOf(')')).split(',');
    const container = document.createElement('div');
    container.style.cssText = `position:absolute; visibility:hidden; height:${height}px; width:0; top:0;`;
    document.body.append(container);
    const ys = points.map((point) => {
      const yExpr = point.trim().replace(/^\S+\s+/, '');
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute; top:${yExpr}; left:0; height:0; width:0;`;
      container.append(probe);
      const y = probe.getBoundingClientRect().top - container.getBoundingClientRect().top;
      probe.remove();
      return y;
    });
    container.remove();
    return ys;
  });
  expect(resting).toHaveLength(4);
  // 오른쪽으로 좁아진다: 오른쪽 위가 더 낮고, 오른쪽 아래가 더 높다.
  expect(resting[1]).toBeGreaterThan(resting[0]);
  expect(resting[2]).toBeLessThan(resting[3]);
});

test('splash leaves carry their number, title and destination from the data', async ({ page }) => {
  await page.goto('/');

  for (const chapter of splashChapters) {
    const leaf = page.locator(`a.splash-leaf#${chapter.id}`);
    await expect(leaf).toHaveAttribute('href', chapter.href);
    await expect(leaf.locator('.splash-leaf__number')).toHaveText(chapter.number);
    await expect(leaf.locator('.splash-leaf__title')).toHaveText(chapter.label);
    await expect(leaf.locator('.splash-leaf__description')).toHaveText(chapter.description);
    // 링크 이름은 제목뿐이다. 설명은 aria-describedby 로만, 한 번 전달된다.
    await expect(leaf).toHaveAccessibleName(chapter.label);
    await expect(leaf).toHaveAccessibleDescription(chapter.description);
  }

  // 목차는 사라졌다.
  await expect(page.locator('.splash-toc')).toHaveCount(0);
  // 워드마크 이미지는 쓰지 않는다.
  await expect(page.locator('.splash-sheaf img')).toHaveCount(0);
});

test('splash sections link to each independent space', async ({ page }) => {
  await page.goto('/');
  for (const [id, href, label] of [
    ['journal', '/blog/', 'Journal'],
    ['works', '/works/', 'Works'],
    ['playroom', '/playroom/', 'Playroom'],
    ['about', '/about/', 'About'],
    ['guestbook', '/guestbook/', 'Guestbook'],
  ]) {
    await expect(page.locator(`a.splash-leaf#${id}`)).toHaveAttribute('href', href);
    await expect(page.locator(`a.splash-leaf#${id} .splash-leaf__title`)).toHaveText(label);
  }
  await page.locator('a.splash-leaf#works').click();
  await expect(page).toHaveURL(/\/works\/$/);
  await expect(page.getByRole('heading', { name: 'Works', exact: true })).toBeVisible();
});

test('splash leaf reacts at once and only widens after the hold', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const leaf = page.locator('a.splash-leaf#works');
  const widthOf = () => leaf.evaluate((element) => element.getBoundingClientRect().width);
  const resting = await widthOf();

  const timing = await page.locator('.splash-sheaf').evaluate((element) => {
    const style = getComputedStyle(element);
    // getComputedStyle of an unregistered custom property re-serializes a lone
    // <time> literal in its canonical unit (seconds), e.g. "340ms" -> ".34s".
    // Read the unit rather than assuming it stayed "ms".
    const ms = (name: string) => {
      const raw = style.getPropertyValue(name).trim();
      const value = parseFloat(raw) || 0;
      return raw.endsWith('ms') ? value : value * 1000;
    };
    return { hold: ms('--leaf-hold'), open: ms('--leaf-open'), react: ms('--leaf-react') };
  });
  expect(timing.hold).toBeGreaterThan(0);

  await leaf.hover();

  // 반응 단계: 배경이 바뀌었지만 폭은 아직 그대로다.
  await page.waitForTimeout(timing.react / 2);
  expect(Math.abs((await widthOf()) - resting)).toBeLessThanOrEqual(2);

  // 펼침 단계: 지연이 지나면 넓어진다.
  await page.waitForTimeout(timing.hold + timing.open);
  expect(await widthOf()).toBeGreaterThan(resting * 1.5);
});

test('splash leaf straightens into a rectangle when it opens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const leaf = page.locator('a.splash-leaf#works');
  const tiltOf = () =>
    leaf.evaluate((element) => parseFloat(getComputedStyle(element).getPropertyValue('--leaf-tilt')));

  expect(await tiltOf()).toBeGreaterThan(0);
  await leaf.hover();
  await page.waitForTimeout(1400);
  expect(await tiltOf()).toBe(0);
  await expect(leaf.locator('.splash-leaf__description')).toBeVisible();
  await expect(leaf.locator('.splash-leaf__invitation')).toBeVisible();
});

test('splash leaf navigates immediately whether or not it has opened', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // 펼쳐지기를 기다리지 않고 바로 누른다.
  await page.locator('a.splash-leaf#playroom').click({ noWaitAfter: false });
  await expect(page).toHaveURL(/\/playroom\/$/);
});

test('splash leaf opens on keyboard focus alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const leaf = page.locator('a.splash-leaf#journal');
  const resting = await leaf.evaluate((element) => element.getBoundingClientRect().width);

  await leaf.focus();
  await page.waitForTimeout(1400);

  expect(await leaf.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(resting * 1.5);
  await expect(leaf.locator('.splash-leaf__description')).toBeVisible();

  // clip-path 가 바깥으로 그린 outline 을 잘라낸다. 링이 남으려면 offset 이 음수여야 한다.
  const outlineOffset = await leaf.evaluate((element) => parseFloat(getComputedStyle(element).outlineOffset));
  expect(outlineOffset).toBeLessThan(0);
});

test('splash artwork appears only in the leaf that has opened', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // 삽화는 인라인 SVG다. 이미지 요청이 늘지 않는다.
  await expect(page.locator('.splash-leaf__art svg.chapter-art')).toHaveCount(splashChapters.length);

  const art = (id: string) => page.locator(`a.splash-leaf#${id} .splash-leaf__art`);
  expect(await art('works').evaluate((element) => parseFloat(getComputedStyle(element).opacity))).toBe(0);

  await page.locator('a.splash-leaf#works').hover();
  await page.waitForTimeout(1400);

  const opened = await art('works').evaluate((element) => parseFloat(getComputedStyle(element).opacity));
  expect(opened).toBeGreaterThan(0.1);
  expect(opened).toBeLessThan(0.5);

  // 이웃은 그대로 감춰져 있다.
  expect(await art('about').evaluate((element) => parseFloat(getComputedStyle(element).opacity))).toBe(0);

  // 삽화가 링크 판정에 끼어들지 않는다.
  expect(await art('works').evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
});

test('splash leaves stack and stay open on narrow screens', async ({ page }) => {
  for (const width of [320, 390, 760, 860]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');

    const boxes = await page
      .locator('.splash-sheaf .splash-leaf')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect()).map((b) => [b.top, b.left]),
      );

    // 세로로 쌓인다.
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index][0]).toBeGreaterThan(boxes[index - 1][0]);
      expect(Math.abs(boxes[index][1] - boxes[0][1])).toBeLessThanOrEqual(1);
    }

    // 기울기와 겹침이 풀린다.
    const tilt = await page
      .locator('.splash-sheaf')
      .evaluate((element) => parseFloat(getComputedStyle(element).getPropertyValue('--leaf-tilt')));
    expect(tilt).toBe(0);

    // 전부 펼쳐져 있다.
    for (const chapter of splashChapters) {
      const detail = page.locator(`a.splash-leaf#${chapter.id} .splash-leaf__detail`);
      // toBeVisible() 은 opacity 를 보지 않는다. 접힘/펼침을 실제로 가르는 것은 이 값이다.
      expect(await detail.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
  }
});

test('splash drops its motion when the visitor asks for less', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const leaf = page.locator('a.splash-leaf#works');
  expect(await leaf.evaluate((element) => getComputedStyle(element).transitionDuration)).toMatch(/^0s(, 0s)*$/);

  // 모션을 꺼도 표지와 낱장이 모두 온전히 보인다.
  expect(await opacityOf(page, '.book-splash__crest')).toBeCloseTo(1, 2);
  expect(await opacityOf(page, '.splash-sheaf')).toBeCloseTo(1, 2);
  await expect(leaf).toBeInViewport();

  // 움직임을 줄여도 목적지는 그대로 열린다.
  await leaf.click();
  await expect(page).toHaveURL(/\/works\/$/);
});

test('splash colophon link returns the reader to the cover where the page scrolls', async ({ page }) => {
  // 데스크톱은 한 화면에 다 들어가 스크롤이 없다. 낱장이 세로로 쌓이는 폭에서만 의미가 있다.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await scrollTo(page, 2000);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

  await page.getByRole('link', { name: /표지로 돌아가기/ }).click();
  await page.waitForFunction(() => window.scrollY < 2);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(2);
});

test('works presents a scannable contents page for every folio', async ({ page }) => {
  await page.goto('/works/');

  const folios = page.locator('.works-index__item');
  await expect(folios).toHaveCount(3);
  // The contents page follows the archive's own order.
  await expect(page.locator('.works-index__name')).toHaveText(works.map((project) => project.title));
  await expect(folios.first()).toContainText('2023.12.11 — 현재');
  await expect(page.locator('.works-index__link').first()).toHaveAttribute('href', '/works/citewell/');

  const logos = page.locator('.works-index__logo');
  await expect(logos).toHaveCount(3);
  for (const logo of await logos.all()) {
    expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    expect(await logo.getAttribute('alt')).toBeTruthy();
  }

  await expect(page.locator('.works-patents__item')).toHaveCount(2);

  const removedRoute = await page.request.get('/portfolio/');
  expect(removedRoute.status()).toBe(404);
});

test('works opens a dedicated folio for each project', async ({ page }) => {
  await page.goto('/works/');
  await page.locator('.works-index__link').first().click();

  await expect(page).toHaveURL(/\/works\/citewell\/$/);
  await expect(page.getByRole('heading', { name: 'CiteWell', exact: true, level: 1 })).toBeVisible();

  const chapters = page.locator('section[data-chapter]');
  await expect(chapters).toHaveCount(8);
  await expect(chapters.first()).toContainText('요구사항');
  await expect(chapters.first()).toContainText('구현');
  await expect(chapters.first()).toContainText('남긴 것');
  await expect(page.locator('.work-doc__rail a[data-rail-link]')).toHaveCount(8);

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

test('independent spaces show a standalone coming soon page', async ({ page }) => {
  for (const route of ['/playroom/', '/about/']) {
    await page.goto(route);
    await expect(page.locator('.main-space-page')).toBeVisible();
    await expect(page.locator('.main-space-page')).toContainText('Coming soon');
    await expect(page.locator('.site-header')).toHaveCount(0);
  }
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
