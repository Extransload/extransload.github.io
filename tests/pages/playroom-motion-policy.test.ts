import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceExtensions = /\.(astro|css|js|jsx|ts|tsx)$/;
const motionPreference = /prefers-reduced-motion|reducedMotion|motion-reduce/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : sourceExtensions.test(entry.name) ? [path] : [];
  });
}

test('Playroom motion never depends on the OS reduced motion setting', () => {
  const files = [...sourceFiles('src/domains/games'), ...sourceFiles('src/pages/playroom'), 'src/pages/playroom.astro'];
  const violations = files.flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .flatMap((line, index) => (motionPreference.test(line) ? [`${file}:${index + 1}`] : [])),
  );

  expect(violations, 'Playroom animations must stay enabled regardless of OS motion settings').toEqual([]);
});
