import { describe, expect, it } from 'vitest';
import astroConfig from '../../astro.config.mjs';
import { renderMarkdown } from '../helpers/render-markdown';

describe('Korean inline emphasis', () => {
  it('is registered in the site markdown pipeline', () => {
    const names = (astroConfig.markdown?.remarkPlugins ?? []).map((entry) => {
      const plugin = Array.isArray(entry) ? entry[0] : entry;
      return typeof plugin === 'function' ? plugin.name : String(plugin);
    });

    expect(names).toContain('remarkKoreanEmphasis');
  });

  it('closes emphasis that is immediately followed by Korean text', () => {
    expect(renderMarkdown('**상호 배제(mutual exclusion)**다')).toBe(
      '<p><strong>상호 배제(mutual exclusion)</strong>다</p>',
    );
  });

  it('closes italics that are immediately followed by Korean text', () => {
    expect(renderMarkdown('*강조*와 나머지')).toBe('<p><em>강조</em>와 나머지</p>');
  });

  it('leaves emphasis followed by whitespace or punctuation unchanged', () => {
    expect(renderMarkdown('**굵게** 그리고')).toBe('<p><strong>굵게</strong> 그리고</p>');
  });
});
