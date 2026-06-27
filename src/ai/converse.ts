import { streamText } from "ai";
import type { ModelMessage } from "ai";
import { anthropic, MODEL } from "./client";
import { buildSystemPrompt } from "./systemPrompt";
import { useProjectStore } from "@/projects/projectStore";
import {
  dispatchWidgetDeclarations,
  dispatchDynamicCanvas,
  dispatchCameraAction,
  type WidgetDeclaration,
  type CameraAction,
} from "./orchestrate";
import { useCanvasStore } from "@/store/canvasStore";
import type { WidgetType } from "@/widgets/types";
import {
  isDynamicCanvasFormat,
  dynamicCanvasResponseSchema,
} from "@/widgets/dynamicSchema";

export interface ConverseCallbacks {
  /** Fires once per completed sentence — drives TTS from here (fallback paths). */
  onSentence: (sentence: string) => void;
  /** Fires on every delta of the raw stream — for a live in-progress ticker. */
  onDelta?: (partial: string) => void;
  /** Fires whenever the extracted speech text grows — drives the ResponseBox. */
  onSpeechDelta?: (speechText: string) => void;
  /**
   * Pre-generate audio for a sentence (returns a play handle + duration). When
   * provided, the sync canvas path is AUDIO-DRIVEN: each segment's text reveal
   * and canvas action are paced to its audio so voice and text stay locked, and
   * the next segment is synthesized while the current plays (no gaps).
   */
  synthesize?: (
    text: string,
  ) => Promise<{ play(): Promise<void>; durationMs: number }>;
}

export interface ConverseResult {
  /** Spoken text from the "speech" field — stored in conversation history. */
  spoken: string;
  /** Full raw JSON string — pushed as the assistant message for context. */
  rawJson: string;
}

// ─── Sync canvas action format ────────────────────────────────────────────────

export interface SyncCanvasAction {
  action: "spawn" | "despawn" | "zoom";
  /** Widget id for spawn/despawn, or "*" to clear all. */
  id?: string;
  /** Target widget id for zoom. */
  targetId?: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scale?: number;
  data?: Record<string, unknown>;
}

const SYNC_TYPE_MAP: Record<string, WidgetType> = {
  "text-block":        "card",
  "bullet-list":       "bullets",
  "stat-card":         "stat",
  "code-block":        "code",
  "arrow":             "arrow",
  "highlight-overlay": "highlight-overlay",
  "progress-bar":      "progress-bar",
  "image-placeholder": "image-placeholder",
  "email-ui":          "email-ui",
};

function executeCanvasAction(action: SyncCanvasAction): void {
  const store = useCanvasStore.getState();
  switch (action.action) {
    case "spawn": {
      if (!action.id || !action.type) break;
      const storeType = SYNC_TYPE_MAP[action.type] ?? (action.type as WidgetType);
      store.spawn({
        id:   action.id,
        type: storeType,
        x:    action.x,
        y:    action.y,
        w:    action.w,
        h:    action.h,
        data: action.data ?? {},
      });
      break;
    }
    case "despawn":
      if (action.id === "*") store.clear();
      else if (action.id) store.despawn(action.id);
      break;
    case "zoom":
      if (action.targetId) store.zoomCamera(action.targetId, action.scale ?? 1.5);
      break;
  }
}

/** Reveals a sentence word-by-word, spread across `durationMs` (default ~paced). */
function typeToTicker(
  sentence: string,
  callbacks: ConverseCallbacks,
  durationMs?: number,
): void {
  callbacks.onSpeechDelta?.("");
  const words = sentence.split(" ").filter(Boolean);
  if (!words.length) return;
  // Pace the words to the audio so text and voice land together. Clamp so very
  // short clips don't flash and very long ones don't crawl.
  const per = durationMs
    ? Math.min(600, Math.max(90, durationMs / words.length))
    : 250;
  let accumulated = "";
  words.forEach((word, i) => {
    setTimeout(() => {
      accumulated += (accumulated ? " " : "") + word;
      callbacks.onSpeechDelta?.(accumulated);
    }, i * per);
  });
}

async function playSyncResponse(
  { speech, canvas }: { speech: string; canvas: SyncCanvasAction[] },
  callbacks: ConverseCallbacks
): Promise<void> {
  const segments = speech.split("|").map((s) => s.trim());
  if (segments.length === 0) return;

  // ── Audio-driven path: voice and text locked together, no gaps ────────────
  // Prefetch each segment's audio while the previous one plays, and pace the
  // text reveal to the real audio duration. This both removes the inter-sentence
  // pauses and keeps the on-screen text exactly in step with the voice.
  if (callbacks.synthesize) {
    const synth = callbacks.synthesize;
    let nextHandle = synth(segments[0] ?? "");
    for (let i = 0; i < segments.length; i++) {
      const handle = await nextHandle;
      if (i + 1 < segments.length) nextHandle = synth(segments[i + 1]); // prefetch
      if (canvas[i]) executeCanvasAction(canvas[i]);
      if (segments[i]) {
        const dur =
          handle.durationMs || segments[i].split(" ").filter(Boolean).length * 300;
        typeToTicker(segments[i], callbacks, dur);
      }
      await handle.play();
    }
    return;
  }

  // ── Fallback path: fixed-pace timed reveal + queue-based TTS ───────────────
  let lastWordFiresAt = 0;
  segments.forEach((segment, i) => {
    const delay = segments.slice(0, i).reduce((acc, seg) => {
      const wc = seg.split(" ").filter(Boolean).length || 1;
      return acc + wc * 250 + 300;
    }, 0);
    setTimeout(() => {
      if (canvas[i]) executeCanvasAction(canvas[i]);
      if (segment) {
        typeToTicker(segment, callbacks);
        callbacks.onSentence(segment);
      }
    }, delay);
    const wc = segment.split(" ").filter(Boolean).length || 1;
    const segmentLastWord = delay + (wc - 1) * 250;
    if (segmentLastWord > lastWordFiresAt) lastWordFiresAt = segmentLastWord;
  });
  return new Promise<void>((resolve) => {
    setTimeout(resolve, lastWordFiresAt + 50);
  });
}

// ─── Main conversation entry point ────────────────────────────────────────────

/**
 * Runs one assistant turn:
 *
 *   1. Streams Claude's JSON response, buffering the full text.
 *   2. Extracts the "speech" field live as tokens arrive, emitting completed
 *      sentences immediately for TTS and the ResponseBox.
 *   3. Once streaming ends, parses the full JSON.
 *      - If the response has a `canvas` array  → playSyncResponse (new sync format)
 *        Each "|"-separated speech segment fires in lock-step with its canvas action.
 *      - If the response has a `widgets` array → dispatchWidgetDeclarations (legacy VTF)
 *   4. On malformed JSON, a fallback text widget is spawned so the canvas is never blank.
 */
export async function converse(
  history: ModelMessage[],
  callbacks: ConverseCallbacks
): Promise<ConverseResult> {
  const context = useProjectStore.getState().getActiveContext();
  const result = streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(context),
    messages: history,
    temperature: 0.7,
  });

  let rawBuffer = "";

  // Buffer the full stream only — text reveal and TTS are both driven later by
  // playSyncResponse so the voice stays in lock-step with the on-screen text.
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      rawBuffer += part.text;
      callbacks.onDelta?.(rawBuffer);
    } else if (part.type === "error") {
      throw part.error;
    }
  }

  let spoken = "";
  const json = rawBuffer.trim();

  try {
    const parsed = JSON.parse(json) as {
      speech?: string;
      reasoning_canvas_strategy?: string;
      widgets?: WidgetDeclaration[];
      canvas?: SyncCanvasAction[];
      camera?: CameraAction;
    };

    spoken = parsed.speech ?? parsed.reasoning_canvas_strategy ?? "";

    if (Array.isArray(parsed.canvas) && parsed.canvas.length > 0) {
      // Synchronised format — speech segments fire in lock-step with canvas actions.
      await playSyncResponse({ speech: spoken, canvas: parsed.canvas }, callbacks);
    } else if (isDynamicCanvasFormat(parsed)) {
      // Dict-based dynamic format — validate with Zod then dispatch.
      const result = dynamicCanvasResponseSchema.safeParse(parsed);
      if (result.success) {
        dispatchDynamicCanvas(result.data);
      } else if (Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
        dispatchWidgetDeclarations(parsed.widgets as WidgetDeclaration[]);
      }
      // No timed reveal here → show + speak the whole response together.
      callbacks.onSpeechDelta?.(spoken);
      callbacks.onSentence(spoken);
    } else if (Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
      dispatchWidgetDeclarations(parsed.widgets);
      if (parsed.camera) dispatchCameraAction(parsed.camera);
      callbacks.onSpeechDelta?.(spoken);
      callbacks.onSentence(spoken);
    }
  } catch {
    const fallbackText = json.slice(0, 300);
    spoken = fallbackText;
    await playSyncResponse(
      {
        speech: fallbackText,
        canvas: [
          {
            action: "spawn",
            type: "text-block",
            id: "fallback",
            x: 10, y: 20, w: 80, h: 50,
            data: { title: "Response", body: fallbackText },
          },
        ],
      },
      callbacks
    );
  }

  return { spoken, rawJson: json };
}
