import { create } from "zustand";
import type { Widget, WidgetType } from "@/widgets/types";

export interface SpawnArgs {
  id: string;
  type: WidgetType;
  x?: number;
  y?: number;
  w?: number;
  h?: number | 'auto';
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
  /** Scale factor applied to the canvas when cameraMode === "zoom". */
  cameraZoomScale: number;

  spawn: (args: SpawnArgs) => void;
  despawn: (id: string) => void;
  update: (id: string, patch: Partial<Widget>) => void;
  resizeWidget: (id: string, h: number) => void;
  zoom: (id: string, scale: number) => void;
  setOpacity: (id: string, opacity: number) => void;
  highlight: (id: string) => void;
  focus: (id: string | null) => void;
  clear: () => void;

  zoomCamera: (targetId: string, scale: number) => void;
  spotlightCamera: (targetId: string) => void;
  resetCamera: () => void;

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
      return {
        widgets: { ...s.widgets, [id]: widget },
        order: s.order.includes(id) ? s.order : [...s.order, id],
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
      };
    }),

  update: (id, patch) =>
    set((s) =>
      s.widgets[id]
        ? { widgets: { ...s.widgets, [id]: { ...s.widgets[id], ...patch } } }
        : s
    ),

  resizeWidget: (id, h) =>
    set((s) =>
      s.widgets[id]
        ? { widgets: { ...s.widgets, [id]: { ...s.widgets[id], measuredH: h } } }
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
    }),

  // ── Camera actions ────────────────────────────────────────────────────────
  // These affect the whole-canvas viewport transform, not individual widgets.

  zoomCamera: (targetId, scale) =>
    set({ cameraMode: "zoom", cameraTargetId: targetId, cameraZoomScale: scale }),

  spotlightCamera: (targetId) =>
    set({ cameraMode: "spotlight", cameraTargetId: targetId }),

  resetCamera: () =>
    set({ cameraMode: "idle", cameraTargetId: null, cameraZoomScale: 1 }),

  // ── Snapshot ──────────────────────────────────────────────────────────────

  snapshot: () => {
    const {
      widgets, order, cameraScale, focusedId,
      cameraMode, cameraTargetId, cameraZoomScale,
    } = get();
    return structuredClone({
      widgets, order, cameraScale, focusedId,
      cameraMode, cameraTargetId, cameraZoomScale,
    });
  },

  restore: (snap) =>
    set({
      widgets:        structuredClone(snap.widgets),
      order:          [...snap.order],
      cameraScale:    snap.cameraScale,
      focusedId:      snap.focusedId,
      cameraMode:     snap.cameraMode     ?? "idle",
      cameraTargetId: snap.cameraTargetId ?? null,
      cameraZoomScale:snap.cameraZoomScale ?? 1,
    }),
}));
