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
      'data-lightbox-open',
      'data-lightbox-download',
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
