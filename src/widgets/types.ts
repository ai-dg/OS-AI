/**
 * The widget databank. Every type the AI is allowed to render on the canvas.
 * Keep this list in sync with `registry.tsx` and the system prompt's catalog.
 */
export type WidgetType =
  | "text"
  | "heading"
  | "bullets"
  | "stat"
  | "card"
  | "arrow"
  | "image"
  | "code"
  | "email"
  | "highlight-overlay"
  | "progress-bar"
  | "image-placeholder"
  | "email-ui"
  // Dynamic widget types (dict-based canvas format)
  | "custom-card"
  | "data-grid"
  | "vector-graphics"
  | "list-container"
  | "image-widget"
  | "network-graph"
  | "circle-stat"
  | "table-widget"
  | "list-widget";

/** Position + size are percentages of the viewport (0–100). */
export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetBase extends WidgetLayout {
  id: string;
  type: WidgetType;
  /** Per-widget zoom factor applied on top of layout (1 = neutral). */
  scale: number;
  /** 0–1; lets the AI dim or highlight individual widgets. */
  opacity: number;
  /** Arbitrary, widget-specific payload validated at render time. */
  data: Record<string, unknown>;
}

export type Widget = WidgetBase;
