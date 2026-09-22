import { describe, expect, it } from 'vitest';
import { clampPan, clampScale, fitScale, maxScaleFor, step, zoomAt } from '../../src/shared/scripts/lightbox-math';

const stage = { width: 1000, height: 600 };

describe('fitScale', () => {
  it('fits a wide image to the stage width', () => {
    expect(fitScale({ width: 2000, height: 600 }, stage)).toBe(0.5);
  });

  it('fits a tall image to the stage height', () => {
    expect(fitScale({ width: 600, height: 1200 }, stage)).toBe(0.5);
  });

  it('never enlarges an image that already fits', () => {
    expect(fitScale({ width: 200, height: 100 }, stage)).toBe(1);
  });

  it('returns 1 for a stage or image with no area', () => {
    expect(fitScale({ width: 0, height: 0 }, stage)).toBe(1);
    expect(fitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
  });
});

describe('maxScaleFor', () => {
  it('always allows at least three times the fitted size', () => {
    expect(maxScaleFor(1)).toBe(3);
  });

  it('allows reaching the original pixels of a downscaled image', () => {
    expect(maxScaleFor(0.1)).toBe(10);
  });
});

describe('clampScale', () => {
  it('keeps the scale between the fitted size and the maximum', () => {
    expect(clampScale(0.4, 3)).toBe(1);
    expect(clampScale(2, 3)).toBe(2);
    expect(clampScale(9, 3)).toBe(3);
  });
});

describe('zoomAt', () => {
  it('holds the point under the cursor still', () => {
    const before = { scale: 1, tx: 0, ty: 0 };
    const point = { x: 120, y: -40 };
    const after = zoomAt(before, 2, point, 5);

    // The image coordinate under `point` maps to the same stage coordinate.
    const imageX = (point.x - before.tx) / before.scale;
    const imageY = (point.y - before.ty) / before.scale;
    expect(after.tx + imageX * after.scale).toBeCloseTo(point.x, 6);
    expect(after.ty + imageY * after.scale).toBeCloseTo(point.y, 6);
    expect(after.scale).toBe(2);
  });

  it('stops at the maximum scale', () => {
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, 10, { x: 0, y: 0 }, 3).scale).toBe(3);
  });

  it('stops at the fitted scale', () => {
    expect(zoomAt({ scale: 1.2, tx: 0, ty: 0 }, 0.1, { x: 0, y: 0 }, 3).scale).toBe(1);
  });
});

describe('clampPan', () => {
  it('centres an image smaller than the stage', () => {
    const panned = clampPan({ scale: 1, tx: 300, ty: 200 }, { width: 400, height: 300 }, stage);
    expect(panned).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('keeps a larger image covering the stage', () => {
    // 2000x1200 on a 1000x600 stage: 500px of slack on each axis.
    const panned = clampPan({ scale: 2, tx: 900, ty: -900 }, { width: 1000, height: 600 }, stage);
    expect(panned.tx).toBe(500);
    expect(panned.ty).toBe(-300);
  });

  it('leaves a position inside the bounds untouched', () => {
    const panned = clampPan({ scale: 2, tx: 100, ty: -50 }, { width: 1000, height: 600 }, stage);
    expect(panned).toEqual({ scale: 2, tx: 100, ty: -50 });
  });
});

describe('step', () => {
  it('moves within the group', () => {
    expect(step(0, 1, 3)).toBe(1);
    expect(step(2, -1, 3)).toBe(1);
  });

  it('stops at both ends instead of wrapping', () => {
    expect(step(0, -1, 3)).toBe(0);
    expect(step(2, 1, 3)).toBe(2);
  });

  it('handles an empty group', () => {
    expect(step(0, 1, 0)).toBe(0);
  });
});
