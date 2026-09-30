import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkDirective from 'remark-directive';
import remarkCallouts from './src/shared/markdown/remark-callouts.js';
import remarkKoreanEmphasis from './src/shared/markdown/remark-korean-emphasis.js';

export default defineConfig({
  site: 'https://extransload.github.io',
  base: '/',
  vite: {
    optimizeDeps: {
      exclude: ['shiki', '@shikijs/engine-oniguruma', '@shikijs/langs'],
    },
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/admin/') && !page.includes('/blog/search/') && !page.includes('/playroom/gomoku/'),
    }),
  ],
  markdown: {
    remarkPlugins: [remarkDirective, remarkCallouts, remarkKoreanEmphasis],
  },
});
