import { describe, expect, it } from 'vitest';
import { attr, byClass, find, loadRoute, tag, text } from '../helpers/dist-html';

const VIEWER = '/blog/tools/markdown-viewer/';

describe('Markdown Viewer page', () => {
  it('exposes a file input the browser picker can open', () => {
    const page = loadRoute(VIEWER);
    const input = byClass(page, 'markdown-viewer__file-input')[0];

    expect(input).toBeDefined();
    expect(attr(input, 'type')).toBe('file');
    expect(attr(input, 'accept')).toContain('.md');
    expect(attr(input, 'id')).toBeTruthy();
  });

  it('labels the dropzone for assistive technology', () => {
    const page = loadRoute(VIEWER);
    const dropzone = find(page, (element) => attr(element, 'data-dropzone') !== undefined);

    expect(dropzone).toBeDefined();
    expect(attr(dropzone!, 'aria-label')).toBeTruthy();
    expect(attr(dropzone!, 'aria-describedby')).toBeTruthy();
  });

  it('gives the tool a single heading', () => {
    const headings = tag(loadRoute(VIEWER), 'h1');

    expect(headings).toHaveLength(1);
    expect(text(headings[0])).toBe('Markdown Viewer');
  });

  it('keeps the viewer out of the site search index', () => {
    const page = loadRoute(VIEWER);
    const main = find(page, (element) => element.tagName === 'main');

    expect(attr(main!, 'data-pagefind-ignore')).toBeDefined();
  });

  it('starts with the output and toolbar hidden until a file is opened', () => {
    const page = loadRoute(VIEWER);
    const output = find(page, (element) => attr(element, 'data-output') !== undefined);
    const toolbar = find(page, (element) => attr(element, 'data-viewer-toolbar') !== undefined);

    expect(attr(output!, 'hidden')).toBeDefined();
    expect(attr(toolbar!, 'hidden')).toBeDefined();
  });
});
