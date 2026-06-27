import { useCanvasStore } from "@/store/canvasStore";
import type { WidgetType } from "@/widgets/types";

export interface CanvasCommand {
  action: "spawn" | "despawn" | "highlight" | "zoom" | "clear";
  /** Required for all actions except "clear". */
  id?: string;
  /** Required for "spawn". */
  type?: WidgetType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Required for "zoom". Defaults to 1.5 if omitted. */
  scale?: number;
  data?: Record<string, unknown>;
}

export function dispatchCanvasCommands(commands: CanvasCommand[]): void {
  const store = useCanvasStore.getState();
  for (const cmd of commands) {
    switch (cmd.action) {
      case "spawn":
        if (cmd.id && cmd.type) {
          store.spawn({
            id: cmd.id,
            type: cmd.type,
            x: cmd.x,
            y: cmd.y,
            w: cmd.w,
            h: cmd.h,
            data: cmd.data,
          });
        }
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
