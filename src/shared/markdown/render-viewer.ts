import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'dompurify';
import { bundledLanguages, codeToHtml } from 'shiki';
import remarkCallouts from './remark-callouts.js';
import remarkKoreanEmphasis from './remark-korean-emphasis.js';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkGfm)
  .use(remarkSmartypants)
  .use(remarkDirective)
  .use(remarkCallouts)
  .use(remarkKoreanEmphasis)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify);

export async function renderViewer(markdown: string) {
  const fragment = document.createElement('div');
  fragment.innerHTML = DOMPurify.sanitize(String(await processor.process(markdown)), {
    USE_PROFILES: { html: true },
  });
  await Promise.all(
    Array.from(fragment.querySelectorAll('pre > code')).map(async (code) => {
      const language =
        Array.from(code.classList)
          .find((name) => name.startsWith('language-'))
          ?.slice(9) ?? 'text';
      const lang = Object.hasOwn(bundledLanguages, language) ? (language as keyof typeof bundledLanguages) : 'text';
      const html = await codeToHtml(code.textContent?.replace(/\n$/, '') ?? '', { lang, theme: 'github-dark' });
      const highlighted = document.createElement('div');
      highlighted.innerHTML = html;
      highlighted.querySelector('pre')?.classList.add('astro-code');
      code.parentElement?.replaceWith(...highlighted.childNodes);
    }),
  );
  return fragment.innerHTML;
}
