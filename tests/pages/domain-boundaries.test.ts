import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'src';
const SOURCE_EXTENSIONS = ['.astro', '.ts', '.js', '.css'];

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

/** Relative import specifiers in a source or stylesheet file. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const patterns = [
    /\bfrom\s+['"](\.[^'"]+)['"]/g, // import x from './y'
    /\bimport\s+['"](\.[^'"]+)['"]/g, // import './y'
    /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g, // await import('./y')
    /@import\s+['"](\.[^'"]+)['"]/g, // css @import './y'
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

/** Which architectural area a src-relative path belongs to. */
function areaOf(path: string): string {
  const parts = normalize(path).split('/');
  if (parts[0] !== SRC) return 'external';
  if (parts[1] === 'pages') return 'pages';
  if (parts[1] === 'shared') return 'shared';
  if (parts[1] === 'domains') return `domain:${parts[2]}`;
  if (parts.length === 2) return 'root'; // src/content.config.ts
  return `stray:${parts[1]}`;
}

const FILES = sourceFiles();
const EDGES = FILES.flatMap((file) =>
  importsOf(file).map((specifier) => ({
    file,
    target: relative('.', join(dirname(file), specifier)),
  })),
);

describe('source layout', () => {
  it('finds the source tree', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(EDGES.length).toBeGreaterThan(20);
  });

  it('keeps every file under pages, domains, or shared', () => {
    const stray = FILES.filter((file) => areaOf(file).startsWith('stray:'));

    expect(stray, 'these files sit outside the pages/domains/shared layout').toEqual([]);
  });

  it('declares the expected domains', () => {
    const domains = new Set(
      FILES.map(areaOf)
        .filter((area) => area.startsWith('domain:'))
        .map((area) => area.slice('domain:'.length)),
    );

    expect([...domains].sort()).toEqual(['blog', 'games', 'main']);
  });
});

describe('domain boundaries', () => {
  it('never lets one domain import another', () => {
    const crossings = EDGES.filter(({ file, target }) => {
      const from = areaOf(file);
      const to = areaOf(target);
      return from.startsWith('domain:') && to.startsWith('domain:') && from !== to;
    }).map(({ file, target }) => `${file} → ${target}`);

    expect(crossings).toEqual([]);
  });

  it('never lets shared code depend on a domain', () => {
    const leaks = EDGES.filter(
      ({ file, target }) => areaOf(file) === 'shared' && areaOf(target).startsWith('domain:'),
    ).map(({ file, target }) => `${file} → ${target}`);

    expect(leaks).toEqual([]);
  });

  it('keeps the root splash free of blog implementation', () => {
    const home = 'src/pages/index.astro';
    const targets = EDGES.filter(({ file }) => file === home).map(({ target }) => areaOf(target));

    expect(targets).not.toContain('domain:blog');
  });

  it('keeps the games space free of blog implementation', () => {
    const gamesFiles = FILES.filter((file) => areaOf(file) === 'domain:games');
    expect(gamesFiles.length).toBeGreaterThan(0);

    const targets = EDGES.filter(({ file }) => gamesFiles.includes(file)).map(({ target }) => areaOf(target));
    expect(targets).not.toContain('domain:blog');
  });

  it('routes every page through a domain or shared implementation', () => {
    // admin.astro is a bare redirect shell that deliberately skips the layout
    // system so the admin app can mount without the site chrome.
    const STANDALONE = ['src/pages/admin.astro'];
    const pageFiles = FILES.filter(
      (file) => areaOf(file) === 'pages' && file.endsWith('.astro') && !STANDALONE.includes(file),
    );
    const orphans = pageFiles.filter(
      (file) => !EDGES.some(({ file: from, target }) => from === file && areaOf(target) !== 'pages'),
    );

    expect(orphans).toEqual([]);
  });
});
