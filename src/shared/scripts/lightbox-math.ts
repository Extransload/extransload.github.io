export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

/** Scale that fits `natural` inside `stage` without enlarging it. */
export function fitScale(natural: Size, stage: Size): number {
  if (natural.width <= 0 || natural.height <= 0 || stage.width <= 0 || stage.height <= 0) return 1;
  return Math.min(1, stage.width / natural.width, stage.height / natural.height);
}

/** Zooming past the fitted size should still reach the image's own pixels. */
export function maxScaleFor(fit: number): number {
  if (!(fit > 0)) return 3;
  return Math.max(3, 1 / fit);
}

export function clampScale(scale: number, max: number): number {
  return Math.min(Math.max(scale, 1), max);
}

/**
 * Scales around `point`, measured from the centre of the stage, so whatever
 * sits under the cursor stays under it.
 */
export function zoomAt(transform: Transform, factor: number, point: Point, max: number): Transform {
  const scale = clampScale(transform.scale * factor, max);
  const ratio = scale / transform.scale;
  return {
    scale,
    tx: point.x - (point.x - transform.tx) * ratio,
    ty: point.y - (point.y - transform.ty) * ratio,
  };
}

/** Holds the image over the stage: centred when smaller, edges outside when larger. */
export function clampPan(transform: Transform, fitted: Size, stage: Size): Transform {
  const limit = (drawn: number, available: number) => Math.max(0, (drawn - available) / 2);
  const x = limit(fitted.width * transform.scale, stage.width);
  const y = limit(fitted.height * transform.scale, stage.height);
  return {
    scale: transform.scale,
    tx: Math.min(Math.max(transform.tx, -x), x),
    ty: Math.min(Math.max(transform.ty, -y), y),
  };
}

/** Moves through a group, stopping at both ends. */
export function step(index: number, delta: -1 | 1, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index + delta, 0), length - 1);
}
