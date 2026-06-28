interface Rect { x: number; y: number; w: number; h: number }

const REGISTRY = new Map<string, Rect>();

// 90px: chatbox (48px) + 8px gap + response box (34px) above the chatbox bottom.
const RESERVED_BOTTOM_PX = 90;

function getCanvasHeight(): number {
  const el = document.querySelector<HTMLElement>(".canvas-bg");
  return el ? el.offsetHeight : window.innerHeight;
}

function recomputeBottomZone(): void {
  const ch = getCanvasHeight();
  const h = (RESERVED_BOTTOM_PX / ch) * 100;
  REGISTRY.set("reserved-bottom-zone", { x: 0, y: 100 - h, w: 100, h });
}

if (typeof window !== "undefined") {
  recomputeBottomZone();
  window.addEventListener("resize", recomputeBottomZone);
}

/**
 * Clamps a widget bounding box so it does not intrude into any registered
 * blocked region. If the widget's bottom exceeds the safe zone, its height
 * is reduced to fit. The minimum clamped height is 5%.
 * Auto-height widgets are returned unchanged — their bottom is not known until measured.
 */
export function clampToSafeZone(rect: {
  x: number;
  y: number;
  w: number;
  h: number | 'auto';
}): { x: number; y: number; w: number; h: number | 'auto' } {
  const zone = REGISTRY.get("reserved-bottom-zone");
  if (!zone) return rect;
  if (typeof rect.h !== 'number') return rect;

  const widgetBottom = rect.y + rect.h;
  if (widgetBottom > zone.y) {
    return { ...rect, h: Math.max(5, zone.y - rect.y) };
  }

  return rect;
}
