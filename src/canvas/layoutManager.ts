import type { Widget } from "@/widgets/types";

// Named canvas regions in 300×300-unit virtual space
export const REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  origin:         { x: 5,   y: 5,   w: 90, h: 69 },
  right:          { x: 110, y: 5,   w: 90, h: 69 },
  "far-right":    { x: 215, y: 5,   w: 80, h: 69 },
  below:          { x: 5,   y: 85,  w: 90, h: 69 },
  "below-right":  { x: 110, y: 85,  w: 90, h: 69 },
  "far-below":    { x: 5,   y: 170, w: 90, h: 69 },
};

/** Resolve a named region to its top-left origin. Falls back to `origin`. */
export function resolveRegion(region: string): { x: number; y: number } {
  const r = REGIONS[region] ?? REGIONS.origin;
  return { x: r.x, y: r.y };
}

/** Minimum zoom scale to fit all spawned widgets in the viewport. */
export function computeMinZoom(widgets: Widget[]): number {
  if (widgets.length === 0) return 0.5;
  const maxX = Math.max(...widgets.map((w) => w.x + w.w)) + 10;
  const maxY = Math.max(...widgets.map((w) => w.y + w.h)) + 10;
  return Math.max(0.1, Math.min(100 / maxX, 74 / maxY) * 0.9);
}

/**
 * Clamp a widget bounding box to the 300-unit virtual canvas.
 * Minimum size: 5 units. Maximum: 120 wide × 90 tall.
 */
export function clampToSafeZone(rect: {
  x: number;
  y: number;
  w: number;
  h: number;
}): { x: number; y: number; w: number; h: number } {
  const cw = Math.min(Math.max(rect.w, 5), 120);
  const ch = Math.min(Math.max(rect.h, 5), 90);
  return {
    x: Math.min(Math.max(rect.x, 0), 290 - cw),
    y: Math.min(Math.max(rect.y, 0), 290 - ch),
    w: cw,
    h: ch,
  };
}
