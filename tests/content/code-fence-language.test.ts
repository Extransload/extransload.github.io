import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const POSTS_ROOT = 'src/domains/blog/content/posts';

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : ['.md', '.mdx'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('Markdown code fences', () => {
  it('declares a language on every opening fence', () => {
    const unlabeled: string[] = [];

    for (const file of markdownFiles(POSTS_ROOT)) {
      let insideFence = false;
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((line, index) => {
        if (!line.startsWith('```')) return;

        if (!insideFence && line.trim() === '```') {
          unlabeled.push(`${relative(POSTS_ROOT, file)}:${index + 1}`);
        }

        insideFence = !insideFence;
      });
    }

    expect(unlabeled, `Unlabeled opening fences:\n${unlabeled.join('\n')}`).toEqual([]);
  });
});
