import { describe, expect, it } from 'vitest';
import { formatTenure, works } from '../../src/domains/main/data/work-archive';

const start = new Date(Date.UTC(2023, 11, 11));
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('formatTenure', () => {
  it('counts whole months only after the day of month is reached', () => {
    expect(formatTenure(start, at('2024-01-10'))).toBe('0개월');
    expect(formatTenure(start, at('2024-01-11'))).toBe('1개월');
  });

  it('drops the month part on an exact anniversary', () => {
    expect(formatTenure(start, at('2026-12-11'))).toBe('3년');
    expect(formatTenure(start, at('2026-12-10'))).toBe('2년 11개월');
  });

  it('reads years and months together in between', () => {
    expect(formatTenure(start, at('2026-09-16'))).toBe('2년 9개월');
  });

  it('never returns a negative span', () => {
    expect(formatTenure(start, at('2020-01-01'))).toBe('0개월');
  });
});

describe('work archive', () => {
  it('keeps the CiteWell tenure derived rather than written down', () => {
    const citewell = works.find((project) => project.slug === 'citewell')!;
    const tenure = citewell.metrics.find((metric) => metric.label === '기간')!.value;

    expect(tenure).toBe(formatTenure(start));
    expect(citewell.summary).toContain(tenure);
  });

  it('gives every project a logo and every gallery image alt text', () => {
    for (const project of works) {
      expect(project.logo.src).toMatch(/^\/images\/works\/logo-/);
      expect(project.logo.alt).toBeTruthy();
      for (const shot of project.gallery) expect(shot.alt.length).toBeGreaterThan(10);
    }
  });
});
