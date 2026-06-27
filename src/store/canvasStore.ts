import { create } from "zustand";
import type { Widget, WidgetType } from "@/widgets/types";

export interface SpawnArgs {
  id: string;
  type: WidgetType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  data?: Record<string, unknown>;
}

export interface CanvasState {
  widgets: Record<string, Widget>;
  /** Render order — last id is on top. */
  order: string[];
  /** Global canvas zoom (camera), separate from per-widget scale. */
  cameraScale: number;
  /** Id the camera is focused on, or null for the whole canvas. */
  focusedId: string | null;

  spawn: (args: SpawnArgs) => void;
  despawn: (id: string) => void;
  update: (id: string, patch: Partial<Widget>) => void;
  zoom: (id: string, scale: number) => void;
  setOpacity: (id: string, opacity: number) => void;
  highlight: (id: string) => void;
  focus: (id: string | null) => void;
  clear: () => void;

  /** Snapshot helpers for the conversation tree. */
  snapshot: () => CanvasSnapshot;
  restore: (snap: CanvasSnapshot) => void;
}

export interface CanvasSnapshot {
  widgets: Record<string, Widget>;
  order: string[];
  cameraScale: number;
  focusedId: string | null;
}

const DEFAULT_LAYOUT = { x: 35, y: 35, w: 30, h: 20 };

export const useCanvasStore = create<CanvasState>((set, get) => ({
  widgets: {},
  order: [],
  cameraScale: 1,
  focusedId: null,

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

  clear: () => set({ widgets: {}, order: [], focusedId: null, cameraScale: 1 }),

  snapshot: () => {
    const { widgets, order, cameraScale, focusedId } = get();
    return structuredClone({ widgets, order, cameraScale, focusedId });
  },

  restore: (snap) =>
    set({
      widgets: structuredClone(snap.widgets),
      order: [...snap.order],
      cameraScale: snap.cameraScale,
      focusedId: snap.focusedId,
    }),
}));
