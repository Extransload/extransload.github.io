import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkCallouts from '../../src/shared/markdown/remark-callouts.js';
import remarkKoreanEmphasis from '../../src/shared/markdown/remark-korean-emphasis.js';

/**
 * Runs markdown through the same remark plugin chain that astro.config.mjs
 * registers, so tests assert on rendered output instead of source text.
 */
export function renderMarkdown(markdown: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkCallouts)
      .use(remarkKoreanEmphasis)
      .use(remarkRehype)
      .use(rehypeStringify)
      .processSync(markdown),
  );
}
