import { create } from "zustand";
import type { Widget, WidgetType } from "@/widgets/types";
import { resolveRegion, computeMinZoom } from "@/canvas/layoutManager";

export interface SpawnArgs {
  id: string;
  type: WidgetType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  data?: Record<string, unknown>;
}

export type CameraMode = "idle" | "zoom" | "spotlight";

export interface CanvasState {
  widgets: Record<string, Widget>;
  /** Render order — last id is on top. */
  order: string[];
  /** Legacy per-widget camera scale (kept for snapshot compat). */
  cameraScale: number;
  /** Id the camera is focused on, or null for the whole canvas. */
  focusedId: string | null;

  /** Drives the cinematic transform and vignette overlay. */
  cameraMode: CameraMode;
  /** Widget targeted by zoom or spotlight (null when idle). */
  cameraTargetId: string | null;
  /** Scale factor applied to the canvas transform. */
  cameraZoomScale: number;

  // ── Spatial canvas fields ─────────────────────────────────────────────────
  /** Camera position in canvas units (top-left of viewport). Default: 0. */
  cameraOffsetX: number;
  /** Camera position in canvas units (top-left of viewport). Default: 0. */
  cameraOffsetY: number;
  /** Minimum zoom to fit all content; updated on every spawn/despawn. */
  minZoomScale: number;
  /** True while AI is generating/speaking — blocks user camera input. */
  isAISpeaking: boolean;
  /** Camera state saved before a zoom so zoom-out restores the district view, not origin. */
  preZoomOffsetX: number;
  preZoomOffsetY: number;
  preZoomScale: number;

  spawn: (args: SpawnArgs) => void;
  despawn: (id: string) => void;
  update: (id: string, patch: Partial<Widget>) => void;
  zoom: (id: string, scale: number) => void;
  setOpacity: (id: string, opacity: number) => void;
  highlight: (id: string) => void;
  focus: (id: string | null) => void;
  clear: () => void;

  zoomCamera: (targetId: string, scale: number) => void;
  spotlightCamera: (targetId: string) => void;
  resetCamera: () => void;

  /** Pan + zoom camera to a named region or explicit coordinates. */
  panZoom: (target: { region?: string; x?: number; y?: number; scale?: number }) => void;
  /** Relative pan by (dx, dy) canvas units. */
  panCamera: (dx: number, dy: number) => void;
  /** Fit all spawned content in the viewport. */
  fitAll: () => void;

  snapshot: () => CanvasSnapshot;
  restore: (snap: CanvasSnapshot) => void;
}

export interface CanvasSnapshot {
  widgets: Record<string, Widget>;
  order: string[];
  cameraScale: number;
  focusedId: string | null;
  cameraMode: CameraMode;
  cameraTargetId: string | null;
  cameraZoomScale: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  minZoomScale: number;
}

const DEFAULT_LAYOUT = { x: 35, y: 35, w: 30, h: 20 };

export const useCanvasStore = create<CanvasState>((set, get) => ({
  widgets: {},
  order: [],
  cameraScale: 1,
  focusedId: null,
  cameraMode: "idle",
  cameraTargetId: null,
  cameraZoomScale: 1,
  cameraOffsetX: 0,
  cameraOffsetY: 0,
  minZoomScale: 0.5,
  isAISpeaking: false,
  preZoomOffsetX: 0,
  preZoomOffsetY: 0,
  preZoomScale: 1,

  spawn: ({ id, type, x, y, w, h, data }) =>
    set((s) => {
      const widget: Widget = {
        id,
        type,
        x: x ?? DEFAULT_LAYOUT.x,
        y: y ?? DEFAULT_LAYOUT.y,
        w: w ?? DEFAULT_LAYOUT.w,
        h: h ?? DEFAULT_LAYOUT.h,
        scale: 1,
        opacity: 1,
        data: data ?? {},
      };
      const next = { ...s.widgets, [id]: widget };
      return {
        widgets: next,
        order: s.order.includes(id) ? s.order : [...s.order, id],
        minZoomScale: computeMinZoom(Object.values(next)),
      };
    }),

  despawn: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.widgets;
      return {
        widgets: rest,
        order: s.order.filter((w) => w !== id),
        focusedId: s.focusedId === id ? null : s.focusedId,
        cameraTargetId: s.cameraTargetId === id ? null : s.cameraTargetId,
        minZoomScale: computeMinZoom(Object.values(rest)),
      };
    }),

  update: (id, patch) =>
    set((s) =>
      s.widgets[id]
        ? { widgets: { ...s.widgets, [id]: { ...s.widgets[id], ...patch } } }
        : s
    ),

  zoom: (id, scale) => get().update(id, { scale }),

  setOpacity: (id, opacity) =>
    get().update(id, { opacity: Math.max(0, Math.min(1, opacity)) }),

  highlight: (id) =>
    set((s) => {
      if (!s.widgets[id]) return s;
      const widgets: Record<string, Widget> = {};
      for (const [wid, w] of Object.entries(s.widgets)) {
        widgets[wid] =
          wid === id
            ? { ...w, opacity: 1, scale: Math.max(w.scale, 1.15) }
            : { ...w, opacity: 0.25 };
      }
      return { widgets, focusedId: id };
    }),

  focus: (id) => set({ focusedId: id }),

  clear: () =>
    set({
      widgets: {},
      order: [],
      focusedId: null,
      cameraScale: 1,
      cameraMode: "idle",
      cameraTargetId: null,
      cameraZoomScale: 1,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
      minZoomScale: 0.5,
      preZoomOffsetX: 0,
      preZoomOffsetY: 0,
      preZoomScale: 1,
    }),

  // ── Camera actions ────────────────────────────────────────────────────────

  zoomCamera: (targetId, scale) => {
    const { widgets, cameraOffsetX, cameraOffsetY, cameraZoomScale } = get();
    const widget = widgets[targetId];
    // Save the pre-zoom camera position so zoom-out can return to this district view.
    const preZoom = { preZoomOffsetX: cameraOffsetX, preZoomOffsetY: cameraOffsetY, preZoomScale: cameraZoomScale };
    if (!widget) {
      set({ ...preZoom, cameraMode: "zoom", cameraTargetId: targetId, cameraZoomScale: scale });
      return;
    }
    const cx = widget.x + widget.w / 2;
    const cy = widget.y + widget.h / 2;
    set({
      ...preZoom,
      cameraMode: "zoom",
      cameraTargetId: targetId,
      cameraZoomScale: scale,
      cameraOffsetX: Math.max(0, cx - 50 / scale),
      cameraOffsetY: Math.max(0, cy - 37 / scale),
    });
  },

  spotlightCamera: (targetId) =>
    set({ cameraMode: "spotlight", cameraTargetId: targetId }),

  // Restores the camera to where it was before the zoom (the district view), not to origin.
  resetCamera: () => {
    const { preZoomOffsetX, preZoomOffsetY, preZoomScale } = get();
    set({
      cameraMode: "idle",
      cameraTargetId: null,
      cameraZoomScale: preZoomScale,
      cameraOffsetX: preZoomOffsetX,
      cameraOffsetY: preZoomOffsetY,
    });
  },

  panZoom: (target) => {
    const coords = target.region
      ? resolveRegion(target.region)
      : { x: target.x ?? 0, y: target.y ?? 0 };
    const scale = target.scale ?? get().cameraZoomScale;
    // Moving to a new region always exits zoom mode so prior dimming never bleeds in.
    set({
      cameraOffsetX: coords.x,
      cameraOffsetY: coords.y,
      cameraZoomScale: scale,
      cameraMode: "idle",
      cameraTargetId: null,
      // Pre-zoom baseline is updated here so zoom-out stays in this new district.
      preZoomOffsetX: coords.x,
      preZoomOffsetY: coords.y,
      preZoomScale: scale,
    });
  },

  panCamera: (dx, dy) =>
    set((s) => ({
      cameraOffsetX: s.cameraOffsetX + dx,
      cameraOffsetY: s.cameraOffsetY + dy,
    })),

  fitAll: () => {
    const all = Object.values(get().widgets);
    const min = computeMinZoom(all);
    set({
      cameraOffsetX: 0,
      cameraOffsetY: 0,
      cameraZoomScale: min,
      minZoomScale: min,
    });
  },

  // ── Snapshot ──────────────────────────────────────────────────────────────

  snapshot: () => {
    const {
      widgets, order, cameraScale, focusedId,
      cameraMode, cameraTargetId, cameraZoomScale,
      cameraOffsetX, cameraOffsetY, minZoomScale,
    } = get();
    return structuredClone({
      widgets, order, cameraScale, focusedId,
      cameraMode, cameraTargetId, cameraZoomScale,
      cameraOffsetX, cameraOffsetY, minZoomScale,
    });
  },

  restore: (snap) =>
    set({
      widgets:         structuredClone(snap.widgets),
      order:           [...snap.order],
      cameraScale:     snap.cameraScale,
      focusedId:       snap.focusedId,
      cameraMode:      snap.cameraMode      ?? "idle",
      cameraTargetId:  snap.cameraTargetId  ?? null,
      cameraZoomScale: snap.cameraZoomScale ?? 1,
      cameraOffsetX:   snap.cameraOffsetX   ?? 0,
      cameraOffsetY:   snap.cameraOffsetY   ?? 0,
      minZoomScale:    snap.minZoomScale     ?? 0.5,
    }),
}));
