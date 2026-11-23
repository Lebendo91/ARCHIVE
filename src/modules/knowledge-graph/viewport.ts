import type { Point } from './layout';

/** How the map is shown: a point of the graph is drawn at `(x + k · px, y + k · py)` on screen. */
export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 3;
/** Zoom of the buttons and of the keyboard. */
export const ZOOM_STEP = 1.25;

export function clampZoom(k: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

/** Zooms by `factor`, keeping the screen point (cx, cy) where it is: the point under the pointer stays. */
export function zoomAround(view: Viewport, factor: number, cx: number, cy: number): Viewport {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

export function toGraph(view: Viewport, sx: number, sy: number): Point {
  return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
}

/** A view showing every point (with its radius) in a `width` × `height` area, never zoomed in above 1.1. */
export function fitView(
  points: Iterable<Point & { r: number }>,
  width: number,
  height: number,
  padding = 48,
): Viewport {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x - point.r);
    minY = Math.min(minY, point.y - point.r);
    maxX = Math.max(maxX, point.x + point.r);
    maxY = Math.max(maxY, point.y + point.r + 16);
  }
  if (!Number.isFinite(minX) || width <= 0 || height <= 0) {
    return { x: width / 2, y: height / 2, k: 1 };
  }
  const k = clampZoom(
    Math.min(
      (width - 2 * padding) / Math.max(1, maxX - minX),
      (height - 2 * padding) / Math.max(1, maxY - minY),
      1.1,
    ),
  );
  return {
    k,
    x: width / 2 - (k * (minX + maxX)) / 2,
    y: height / 2 - (k * (minY + maxY)) / 2,
  };
}

/**
 * The smallest move of the view that brings a point inside the area, `margin` away from its edges: enough room
 * for the label written under it.
 */
export function revealPoint(
  view: Viewport,
  point: Point,
  width: number,
  height: number,
  margin = 110,
): Viewport {
  const sx = view.x + view.k * point.x;
  const sy = view.y + view.k * point.y;
  const dx = sx < margin ? margin - sx : sx > width - margin ? width - margin - sx : 0;
  const dy = sy < margin ? margin - sy : sy > height - margin ? height - margin - sy : 0;
  return dx === 0 && dy === 0 ? view : { ...view, x: view.x + dx, y: view.y + dy };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const VECTORS: Record<Direction, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/**
 * The node an arrow key leads to: the closest one in that direction, a node straight ahead being preferred
 * to a closer one far to the side.
 */
export function nearestInDirection(
  from: Point,
  candidates: Iterable<[string, Point]>,
  direction: Direction,
): string | undefined {
  const [dx, dy] = VECTORS[direction];
  let best: string | undefined;
  let bestScore = Infinity;
  for (const [key, point] of candidates) {
    const vx = point.x - from.x;
    const vy = point.y - from.y;
    const along = vx * dx + vy * dy;
    if (along <= 1) {
      continue;
    }
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

/** Distance from a point to the segment [a, b]. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length = vx * vx + vy * vy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / length));
  return Math.hypot(point.x - (a.x + t * vx), point.y - (a.y + t * vy));
}
