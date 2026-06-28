import { useCanvasStore } from "@/store/canvasStore";
import type { WidgetType } from "@/widgets/types";
import { clampToSafeZone } from "@/canvas/layoutManager";
import type { DynamicCanvasPayload } from "@/widgets/dynamicSchema";

// ─── Legacy canvas-command format ─────────────────────────────────────────────

export interface CanvasCommand {
  action: "spawn" | "despawn" | "highlight" | "zoom" | "clear";
  id?: string;
  type?: WidgetType;
  x?: number;
  y?: number;
  w?: number;
  h?: number | 'auto';
  scale?: number;
  data?: Record<string, unknown>;
}

export function dispatchCanvasCommands(commands: CanvasCommand[]): void {
  const store = useCanvasStore.getState();
  for (const cmd of commands) {
    switch (cmd.action) {
      case "spawn":
        if (cmd.id && cmd.type)
          store.spawn({ id: cmd.id, type: cmd.type, x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h, data: cmd.data });
        break;
      case "despawn":
        if (cmd.id) store.despawn(cmd.id);
        break;
      case "highlight":
        if (cmd.id) store.highlight(cmd.id);
        break;
      case "zoom":
        if (cmd.id) store.zoom(cmd.id, cmd.scale ?? 1.5);
        break;
      case "clear":
        store.clear();
        break;
    }
  }
}

// ─── Camera action format ─────────────────────────────────────────────────────

export interface CameraAction {
  action: "zoom" | "zoom-out" | "spotlight";
  /** Target widget id (required for zoom and spotlight). */
  target_widget_id?: string;
  /** Zoom scale factor (default 1.8, only used with action: "zoom"). */
  scale?: number;
}

/**
 * Dispatches a single camera action from Claude's optional `camera` field.
 * Drives `zoomCamera`, `spotlightCamera`, or `resetCamera` on the canvas store.
 */
export function dispatchCameraAction(action: CameraAction): void {
  const store = useCanvasStore.getState();
  switch (action.action) {
    case "zoom":
      if (action.target_widget_id)
        store.zoomCamera(action.target_widget_id, action.scale ?? 1.8);
      break;
    case "zoom-out":
      store.resetCamera();
      break;
    case "spotlight":
      if (action.target_widget_id)
        store.spotlightCamera(action.target_widget_id);
      break;
  }
}

// ─── Visual Translation Framework — declarative widget format ─────────────────

export interface WidgetPosition {
  top:    string; // e.g. "10%"
  left:   string;
  width:  string;
  height: string;
}

export interface WidgetDeclaration {
  id:       string;
  type:     string; // new names: text-block, bullet-list, stat-card, arrow, code-block
  position: WidgetPosition;
  props:    Record<string, unknown>;
}

/**
 * Maps the new Visual Translation Framework type names to internal WidgetType
 * values. Old names pass through unchanged.
 */
const TYPE_MAP: Record<string, WidgetType> = {
  "text-block":  "card",
  "bullet-list": "bullets",
  "stat-card":   "stat",
  "code-block":  "code",
  "arrow":       "arrow",
  // four new specialized types
  "highlight-overlay":  "highlight-overlay",
  "progress-bar":       "progress-bar",
  "image-placeholder":  "image-placeholder",
  "email-ui":           "email-ui",
  "math-block":         "math-block",
  // dynamic image widget
  "image-widget":    "image-widget",
  "network-graph":   "network-graph",
  "circle-stat":     "circle-stat",
  "key-value-card":  "key-value-card",
  "timeline":        "timeline",
  "callout":         "callout",
  "comparison-card": "comparison-card",
  // pass-through for any legacy name Claude might emit
  text:    "text",
  heading: "heading",
  bullets: "bullets",
  stat:    "stat",
  card:    "card",
  image:   "image",
  code:    "code",
  email:   "email",
};

/** Parses a "42%" or 42 value to a plain number. */
function pct(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

/**
 * Maps the declarative `props` object from the new format into the `data`
 * object expected by the canvas store.
 */
function mapProps(rawType: string, props: Record<string, unknown>): Record<string, unknown> {
  switch (rawType) {
    case "text-block":
      return { title: props.title ?? "", body: props.body ?? "" };

    case "bullet-list":
      return { items: Array.isArray(props.items) ? props.items : [] };

    case "stat-card":
      return { value: props.value ?? "", label: props.label ?? "" };

    case "code-block":
      return { code: props.code ?? "", lang: props.language ?? props.lang ?? "code" };

    case "arrow":
      return {
        from: props.from_widget_id ?? props.from,
        to:   props.to_widget_id   ?? props.to,
      };

    case "highlight-overlay":
      return { color: props.color ?? "indigo" };

    case "progress-bar":
      return {
        label:       props.label       ?? "",
        targetValue: props.targetValue ?? props.value ?? 0,
      };

    case "image-placeholder":
      return {
        label:       props.label       ?? "",
        description: props.description ?? "",
      };

    case "email-ui":
      return {
        from:        props.from        ?? "",
        subject:     props.subject     ?? "",
        previewText: props.previewText ?? props.preview ?? "",
        timestamp:   props.timestamp   ?? "",
      };

    case "network-graph":
      return {
        title: props.title ?? "",
        nodes: Array.isArray(props.nodes) ? props.nodes : [],
        edges: Array.isArray(props.edges) ? props.edges : [],
      };

    case "circle-stat":
      return {
        value: props.value ?? "",
        label: props.label ?? "",
        color: props.color ?? "indigo",
      };

    default:
      // Legacy or unknown type — pass props through as-is.
      return props;
  }
}

export interface DispatchOptions {
  /**
   * Milliseconds between each successive widget spawn.
   * 0 (default) spawns all widgets synchronously in the same frame.
   * Set to 200 for the Gmail column stagger effect.
   */
  staggerMs?: number;
}

/**
 * Dispatches a declarative `widgets` array from the Visual Translation
 * Framework format. Clears the canvas first (sync), then spawns every widget
 * — either immediately or with a per-widget stagger delay.
 */
export function dispatchWidgetDeclarations(
  declarations: WidgetDeclaration[],
  options: DispatchOptions = {}
): void {
  const { staggerMs = 0 } = options;

  // Clear always happens synchronously so the canvas blanks before the first
  // widget appears, even when stagger delays are active.
  useCanvasStore.getState().clear();

  function spawnOne(decl: WidgetDeclaration): void {
    const storeType = TYPE_MAP[decl.type];
    if (!storeType) return;
    const { top, left, width, height } = decl.position ?? {};
    const safe = clampToSafeZone({
      x: pct(left),
      y: pct(top),
      w: pct(width),
      h: pct(height),
    });
    useCanvasStore.getState().spawn({
      id:   decl.id,
      type: storeType,
      ...safe,
      data: mapProps(decl.type, decl.props ?? {}),
    });
  }

  for (let i = 0; i < declarations.length; i++) {
    const decl = declarations[i];
    if (staggerMs > 0 && i > 0) {
      setTimeout(() => spawnOne(decl), staggerMs * i);
    } else {
      spawnOne(decl);
    }
  }
}

// ─── Dynamic canvas format (dict-based) ───────────────────────────────────────

const DYNAMIC_TYPES = new Set([
  "custom-card",
  "data-grid",
  "vector-graphics",
  "list-container",
  "image-widget",
]);

/**
 * Dispatches the new dict-based dynamic canvas payload from Claude.
 * Clears the canvas, then spawns one widget per entry in `payload.widgets`.
 *
 * - Known dynamic types are stored as-is (`custom-card` etc.).
 * - Unknown types are coerced to `custom-card` at the store level; the
 *   original type string is preserved in `data.original_type` so
 *   DynamicWidgetFactory can show it in the fallback renderer.
 * - Camera action is NOT dispatched here — converse.ts calls
 *   dispatchCameraAction() separately after this function returns.
 */
export function dispatchDynamicCanvas(payload: DynamicCanvasPayload): void {
  const store = useCanvasStore.getState();
  store.clear();

  for (const [id, decl] of Object.entries(payload.widgets)) {
    const rawType = decl.type ?? "custom-card";
    const { top, left, width, height } = decl.position;
    const coords = { x: pct(left), y: pct(top), w: pct(width), h: pct(height) };

    if (DYNAMIC_TYPES.has(rawType)) {
      // Known dynamic type — payload passes through to DynamicWidgetFactory
      store.spawn({
        id, type: rawType as WidgetType, ...coords,
        data: {
          original_type:   rawType,
          style_overrides: decl.style_overrides,
          payload:         decl.payload,
        },
      });
    } else if (TYPE_MAP[rawType]) {
      // Legacy type accidentally sent in dict format — map it through the
      // normal pipeline so renderers receive the data shape they expect.
      store.spawn({
        id, type: TYPE_MAP[rawType], ...coords,
        data: mapProps(rawType, (decl.payload ?? {}) as Record<string, unknown>),
      });
    } else {
      // Truly unknown type — show fallback badge rather than crashing.
      store.spawn({
        id, type: "custom-card" as WidgetType, ...coords,
        data: { original_type: rawType, payload: decl.payload },
      });
    }
  }
}
