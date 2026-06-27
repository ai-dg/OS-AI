import { tool } from "ai";
import { z } from "zod";
import { useCanvasStore } from "@/store/canvasStore";
import type { WidgetType } from "@/widgets/types";

const widgetTypes: [WidgetType, ...WidgetType[]] = [
  "text",
  "heading",
  "bullets",
  "stat",
  "card",
  "arrow",
  "image",
  "code",
  "email",
];

/**
 * Client-side UI tools. Each `execute` mutates the canvas store directly and
 * returns immediately, so the model keeps talking in the same multi-step run
 * while widgets appear live on screen.
 */
export const uiTools = {
  renderWidget: tool({
    description:
      "Spawn a widget on the black canvas. Position/size are percentages of the screen (0-100). Reuse an existing id to update a widget in place.",
    inputSchema: z.object({
      id: z.string().describe("stable id, e.g. 'stat1' — reuse to update"),
      type: z.enum(widgetTypes),
      x: z.number().min(0).max(100).optional(),
      y: z.number().min(0).max(100).optional(),
      w: z.number().min(5).max(100).optional(),
      h: z.number().min(5).max(100).optional(),
      data: z
        .record(z.string(), z.unknown())
        .describe(
          "payload: text{text}, heading{text}, bullets{items[]}, stat{value,label}, card{title,body}, arrow{direction}, image{src,alt,caption}, code{code}, email{from,subject,body}"
        ),
    }),
    execute: async ({ id, type, x, y, w, h, data }) => {
      useCanvasStore.getState().spawn({ id, type, x, y, w, h, data });
      return { ok: true, id };
    },
  }),

  removeWidget: tool({
    description: "Remove a widget from the canvas by id.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      useCanvasStore.getState().despawn(id);
      return { ok: true, id };
    },
  }),

  zoomWidget: tool({
    description: "Scale a widget to draw attention (1 = normal, 1.5 = emphasis).",
    inputSchema: z.object({ id: z.string(), scale: z.number().min(0.2).max(3) }),
    execute: async ({ id, scale }) => {
      useCanvasStore.getState().zoom(id, scale);
      return { ok: true };
    },
  }),

  setOpacity: tool({
    description: "Set a widget's opacity (0 = invisible, 1 = solid) to dim or restore it.",
    inputSchema: z.object({ id: z.string(), opacity: z.number().min(0).max(1) }),
    execute: async ({ id, opacity }) => {
      useCanvasStore.getState().setOpacity(id, opacity);
      return { ok: true };
    },
  }),

  highlightWidget: tool({
    description:
      "Spotlight one widget: it grows and stays solid while every other widget dims.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      useCanvasStore.getState().highlight(id);
      return { ok: true };
    },
  }),

  clearCanvas: tool({
    description: "Remove every widget and reset the camera. Use when changing topic.",
    inputSchema: z.object({}),
    execute: async () => {
      useCanvasStore.getState().clear();
      return { ok: true };
    },
  }),
};
