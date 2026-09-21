import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

export type DistElement = DefaultTreeAdapterMap['element'];
type DistNode = DefaultTreeAdapterMap['childNode'] | DefaultTreeAdapterMap['document'];

const DIST = 'dist';

const BUILD_HINT = 'Built output is missing. Run `npm run build` before the dist contract tests.';

/** Maps a site route such as `/blog/posts/` to its built HTML file. */
export function routeFile(route: string): string {
  const clean = route.replace(/^\/+|\/+$/g, '');
  return clean ? `${DIST}/${clean}/index.html` : `${DIST}/index.html`;
}

export function routeExists(route: string): boolean {
  if (!existsSync(DIST)) throw new Error(BUILD_HINT);
  return existsSync(routeFile(route));
}

/** Parses a built route. Throws a actionable error when the build is absent. */
export function loadRoute(route: string): DistNode {
  const file = routeFile(route);
  if (!existsSync(file)) {
    throw new Error(existsSync(DIST) ? `No built page for route ${route} (${file})` : BUILD_HINT);
  }
  return parse(readFileSync(file, 'utf8'));
}

export function rawRoute(route: string): string {
  const file = routeFile(route);
  if (!existsSync(file)) {
    throw new Error(existsSync(DIST) ? `No built page for route ${route} (${file})` : BUILD_HINT);
  }
  return readFileSync(file, 'utf8');
}

function childrenOf(node: DistNode): DistNode[] {
  return 'childNodes' in node && node.childNodes ? (node.childNodes as DistNode[]) : [];
}

/** Depth-first search over the parsed tree. */
export function findAll(root: DistNode, match: (element: DistElement) => boolean): DistElement[] {
  const found: DistElement[] = [];
  const walk = (node: DistNode) => {
    if ('tagName' in node && match(node as DistElement)) found.push(node as DistElement);
    for (const child of childrenOf(node)) walk(child);
  };
  walk(root);
  return found;
}

export function find(root: DistNode, match: (element: DistElement) => boolean): DistElement | undefined {
  return findAll(root, match)[0];
}

export function tag(root: DistNode, tagName: string): DistElement[] {
  return findAll(root, (element) => element.tagName === tagName);
}

export function attr(element: DistElement, name: string): string | undefined {
  return element.attrs?.find((candidate) => candidate.name === name)?.value;
}

export function classList(element: DistElement): string[] {
  return (attr(element, 'class') ?? '').split(/\s+/).filter(Boolean);
}

export function hasClass(element: DistElement, className: string): boolean {
  return classList(element).includes(className);
}

export function byClass(root: DistNode, className: string): DistElement[] {
  return findAll(root, (element) => hasClass(element, className));
}

export function meta(root: DistNode, key: string): string | undefined {
  const element = find(
    root,
    (candidate) =>
      candidate.tagName === 'meta' && (attr(candidate, 'property') === key || attr(candidate, 'name') === key),
  );
  return element && attr(element, 'content');
}

/** Visible text of an element, whitespace-collapsed. */
export function text(node: DistNode): string {
  let out = '';
  const walk = (current: DistNode) => {
    if ('nodeName' in current && current.nodeName === '#text') {
      out += (current as { value: string }).value;
    }
    for (const child of childrenOf(current)) walk(child);
  };
  walk(node);
  return out.replace(/\s+/g, ' ').trim();
}

/** Every in-site href on the page, normalised to a path. */
export function links(root: DistNode): string[] {
  return tag(root, 'a')
    .map((anchor) => attr(anchor, 'href') ?? '')
    .filter((href) => href.startsWith('/'));
}

/** Every route with a built index.html, as site-absolute paths. */
export function builtRoutes(): string[] {
  if (!existsSync(DIST)) throw new Error(BUILD_HINT);
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
      else if (entry.name === 'index.html') out.push(prefix || '/');
    }
  };
  walk(DIST, '/');
  return out.sort();
}

/** Decoded <loc> paths from the generated sitemap. */
export function sitemapRoutes(): string[] {
  const file = `${DIST}/sitemap-0.xml`;
  if (!existsSync(file)) throw new Error(`${BUILD_HINT} (no sitemap at ${file})`);
  const xml = readFileSync(file, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => decodeURIComponent(new URL(match[1]).pathname))
    .sort();
}
