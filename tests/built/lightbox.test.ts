import { describe, expect, it } from 'vitest';
import { attr, findAll, loadRoute } from '../helpers/dist-html';

const LAYOUTS = [
  ['splash', '/'],
  ['site', '/blog/'],
  ['main space', '/works/degureure/'],
  ['independent space', '/about/'],
] as const;

const dialogs = (route: string) =>
  findAll(
    loadRoute(route),
    (element) => element.tagName === 'dialog' && (attr(element, 'class') ?? '').includes('image-lightbox'),
  );

const groups = (route: string) =>
  findAll(loadRoute(route), (element) => attr(element, 'data-lightbox-group') !== undefined);

describe('image lightbox', () => {
  it.each(LAYOUTS)('mounts once on the %s layout', (_name, route) => {
    expect(dialogs(route)).toHaveLength(1);
  });

  it('gives the dialog the controls the script expects', () => {
    const dialog = dialogs('/blog/')[0];
    for (const hook of [
      'data-lightbox-stage',
      'data-lightbox-caption',
      'data-lightbox-counter',
      'data-lightbox-close',
      'data-lightbox-prev',
      'data-lightbox-next',
      'data-lightbox-zoom-in',
      'data-lightbox-zoom-out',
    ]) {
      expect(
        findAll(dialog, (element) => attr(element, hook) !== undefined),
        hook,
      ).toHaveLength(1);
    }
  });

  it('groups a post body so its images step together', () => {
    expect(groups('/blog/posts/macos-space/')).toHaveLength(1);
  });

  it('groups each works gallery section on its own', () => {
    // 데구르르 has a video section and a screens section.
    expect(groups('/works/degureure/')).toHaveLength(2);
  });

  it('groups the markdown viewer output', () => {
    expect(groups('/blog/tools/markdown-viewer/')).toHaveLength(1);
  });
});

describe('post sharing', () => {
  it('offers one share control beside the title of a post', () => {
    const post = loadRoute('/blog/posts/heap-heapsort/');
    const buttons = findAll(post, (element) => attr(element, 'data-share-post') !== undefined);

    expect(buttons).toHaveLength(1);
    expect(attr(buttons[0], 'aria-label')).toBeTruthy();
    // It reads the canonical link at click time, so that link must be present.
    expect(findAll(post, (element) => element.tagName === 'link' && attr(element, 'rel') === 'canonical')).toHaveLength(
      1,
    );
  });

  it('keeps the share control out of pages that are not posts', () => {
    for (const route of ['/blog/', '/works/degureure/', '/']) {
      expect(
        findAll(loadRoute(route), (element) => attr(element, 'data-share-post') !== undefined),
        route,
      ).toHaveLength(0);
    }
  });
});
