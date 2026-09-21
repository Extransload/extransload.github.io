import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface WorkflowStep {
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  permissions?: Record<string, unknown>;
  steps?: WorkflowStep[];
}

interface PagesWorkflow {
  permissions?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
}

function hasContentsWrite(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasContentsWrite);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, nestedValue]) => (key === 'contents' && nestedValue === 'write') || hasContentsWrite(nestedValue),
    );
  }
  return false;
}

describe('release configuration', () => {
  it('has a Pages workflow and site metadata', () => {
    expect(existsSync('.github/workflows/deploy.yml')).toBe(true);
    expect(existsSync('public/robots.txt')).toBe(true);
    expect(existsSync('public/favicon.png')).toBe(true);
    expect(existsSync('src/pages/rss.xml.ts')).toBe(true);
    expect(readFileSync('astro.config.mjs', 'utf8')).toContain('extransload.github.io');
    expect(readFileSync('astro.config.mjs', 'utf8')).toContain('@astrojs/sitemap');

    const workflow = parse(readFileSync('.github/workflows/deploy.yml', 'utf8')) as PagesWorkflow;
    const build = workflow.jobs?.build;
    const deploy = workflow.jobs?.deploy;
    const upload = build?.steps?.find((step) => step.uses === 'actions/upload-pages-artifact@v3');

    expect(hasContentsWrite(workflow)).toBe(false);
    expect(workflow.permissions?.contents).toBe('read');
    expect(build?.steps?.some((step) => step.run === 'npm ci')).toBe(true);
    expect(build?.steps?.some((step) => step.run === 'npm run build')).toBe(true);
    expect(upload?.with?.path).toBe('dist');
    expect(deploy?.permissions).toMatchObject({
      pages: 'write',
      'id-token': 'write',
    });
    expect(deploy?.steps?.some((step) => step.uses === 'actions/deploy-pages@v4')).toBe(true);

    expect(readFileSync('public/robots.txt', 'utf8')).toContain(
      'Sitemap: https://extransload.github.io/sitemap-index.xml',
    );
  });
});
