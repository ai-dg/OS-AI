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
  | "math-block"
  // School demo widgets
  | "task-list"
  | "qcm"
  | "lesson"
  | "mail-compose"
  | "dialog"
  // General-purpose rich widgets
  | "key-value-card"
  | "timeline"
  | "callout"
  | "comparison-card";

/** Position + size are percentages of the viewport (0–100). */
export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number | 'auto';
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
  /** Set by ResizeObserver after mount, in canvas % units. Only used when h === 'auto'. */
  measuredH?: number;
}

export type Widget = WidgetBase;
