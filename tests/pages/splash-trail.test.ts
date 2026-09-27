import { describe, expect, it } from 'vitest';
import { splashChapters } from '../../src/domains/main/data/splash-chapters';
import { createSplashTrail, TRAIL_WIDTH } from '../../src/domains/main/data/splash-trail';

describe('splash trail content changes', () => {
  it.each([0, 1, 2, 3, 5, 6, 7, 9])('keeps %i chapters reachable in editorial order', (count) => {
    const chapters = Array.from({ length: count }, (_, index) => ({ id: `chapter-${index}` }));
    const { stops, height } = createSplashTrail(chapters);
    expect(stops.map((stop) => stop.chapter)).toEqual(chapters);
    expect(height).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(stop.x).toBeGreaterThan(0);
      expect(stop.x).toBeLessThan(TRAIL_WIDTH);
      expect(stop.y).toBeGreaterThan(0);
      expect(stop.y).toBeLessThan(height);
    }
    expect(new Set(stops.map((stop) => `${stop.x},${stop.y}`)).size).toBe(count);
  });

  it('lays out changed content without retaining deleted destinations', () => {
    const revised = [...splashChapters.filter((chapter) => chapter.id !== 'works'), { id: 'new-chapter' }];
    const { stops } = createSplashTrail(revised);
    expect(stops.map((stop) => stop.chapter.id)).toEqual(revised.map((chapter) => chapter.id));
  });
});
