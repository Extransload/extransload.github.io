import { describe, expect, it } from 'vitest';
import astroConfig from '../../astro.config.mjs';
import { renderMarkdown } from '../helpers/render-markdown';

type RemarkEntry = NonNullable<NonNullable<typeof astroConfig.markdown>['remarkPlugins']>[number];

const pluginName = (entry: RemarkEntry): string => {
  const plugin = Array.isArray(entry) ? entry[0] : entry;
  return typeof plugin === 'function' ? plugin.name : String(plugin);
};

const CALLOUTS = [
  ['note', '✦', 'Note'],
  ['tip', '✧', 'Tip'],
  ['warning', '⚠', 'Warning'],
  ['important', '◆', 'Important'],
  ['success', '✓', 'Success'],
] as const;

describe('Markdown callouts', () => {
  it('runs the directive parser before the callout transform', () => {
    const names = (astroConfig.markdown?.remarkPlugins ?? []).map(pluginName);

    expect(names).toContain('remarkDirective');
    expect(names).toContain('remarkCallouts');
    expect(names.indexOf('remarkDirective')).toBeLessThan(names.indexOf('remarkCallouts'));
  });

  it.each(CALLOUTS)('renders :::%s as a labelled callout surface', (name, icon, label) => {
    const html = renderMarkdown(`:::${name}\n본문입니다.\n:::`);

    expect(html).toContain(`<aside class="callout callout--${name} editorial-surface" role="note">`);
    expect(html).toContain(
      `<p class="callout__title"><span class="callout__icon" aria-hidden="true">${icon}</span> ${label}</p>`,
    );
    expect(html).toContain('<p>본문입니다.</p>');
  });

  it('falls back to the note callout for an unrecognised directive name', () => {
    const html = renderMarkdown(':::bogus\n알 수 없음.\n:::');

    expect(html).toContain('<aside class="callout callout--note editorial-surface" role="note">');
    expect(html).toContain('Note</p>');
    expect(html).not.toContain('callout--bogus');
  });

  it('marks the icon as decorative so screen readers announce only the label', () => {
    const html = renderMarkdown(':::tip\n도움말.\n:::');

    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<aside[^>]*role="note"/);
  });

  it('leaves ordinary markdown free of callout markup', () => {
    const html = renderMarkdown('그냥 문단입니다.\n\n> 인용문');

    expect(html).not.toContain('callout');
    expect(html).toContain('<blockquote>');
  });
});
