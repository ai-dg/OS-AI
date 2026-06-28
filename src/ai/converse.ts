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
  action: "spawn" | "despawn" | "zoom" | "zoom-out" | "spotlight" | "hold"
        | "pan-zoom" | "pan" | "fit-all";
  /** Widget id for spawn/despawn, or "*" to clear all. */
  id?: string;
  /** Target widget id for zoom or spotlight. */
  targetId?: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scale?: number;
  data?: Record<string, unknown>;
  /** Named region for pan-zoom (e.g. "right", "below"). */
  region?: string;
  /** Relative pan delta for the `pan` action. */
  dx?: number;
  dy?: number;
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
  "math-block":        "math-block",
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
    case "zoom-out":
      store.resetCamera();
      break;
    case "spotlight":
      if (action.targetId) store.spotlightCamera(action.targetId);
      break;
    case "pan-zoom":
      store.panZoom({ region: action.region, x: action.x, y: action.y, scale: action.scale });
      break;
    case "pan":
      store.panCamera(action.dx ?? 0, action.dy ?? 0);
      break;
    case "fit-all":
      store.fitAll();
      break;
    case "hold":
      break; // camera and canvas unchanged — speech segment plays over current state
  }
}

/**
 * Pulls the (possibly still-incomplete) value of the `"speech"` field out of a
 * partial JSON buffer as it streams in. Returns "" until the field appears.
 * Used to show Claude's answer forming live instead of waiting for the whole
 * JSON to finish — handles the common escapes and stops at the closing quote.
 */
function extractPartialSpeech(buf: string): string {
  const m = buf.match(/"speech"\s*:\s*"/);
  if (!m || m.index === undefined) return "";
  let i = m.index + m[0].length;
  let out = "";
  while (i < buf.length) {
    const c = buf[i];
    if (c === "\\") {
      const n = buf[i + 1];
      if (n === undefined) break; // escape split across chunks — stop here
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else out += n;
      i += 2;
      continue;
    }
    if (c === '"') break; // end of the speech string
    out += c;
    i++;
  }
  // Speech uses "|" to mark segment boundaries — render them as spaces.
  return out.replace(/\|/g, " ").replace(/\s+/g, " ").trimStart();
}

/** Reveals a sentence word-by-word, spread across `durationMs` (default ~paced). */
function typeToTicker(
  sentence: string,
  callbacks: ConverseCallbacks,
  durationMs?: number,
  prefix = "",
): void {
  // Show whatever was already revealed (prior segments) immediately, then type
  // this segment's words on top of it. `prefix=""` reproduces the old reset-
  // per-segment behaviour used by the fixed-pace fallback path.
  callbacks.onSpeechDelta?.(prefix);
  const words = sentence.split(" ").filter(Boolean);
  if (!words.length) return;
  // Pace the words to the audio so text and voice land together. Clamp so very
  // short clips don't flash and very long ones don't crawl.
  const per = durationMs
    ? Math.min(600, Math.max(90, durationMs / words.length))
    : 250;
  let accumulated = prefix;
  words.forEach((word, i) => {
    setTimeout(() => {
      accumulated += (accumulated ? " " : "") + word;
      callbacks.onSpeechDelta?.(accumulated);
    }, i * per);
  });
}

async function playSyncResponse(
  { speech, canvas }: { speech: string; canvas: SyncCanvasAction[] },
  callbacks: ConverseCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const segments = speech.split("|").map((s) => s.trim());
  if (segments.length === 0) return;

  // ── Audio-driven path: text paced to voice, gap-free playback ─────────────
  // For each segment we (a) paint its widget immediately, (b) reveal its words
  // word-by-word timed to that segment's audio duration, and (c) play the clip,
  // prefetching the next one so there's no gap. Text reveal and audio share the
  // same `durationMs`, so voice and text advance together. Synthesis runs in a
  // worker, so nothing blocks the UI.
  if (callbacks.synthesize) {
    const synth = callbacks.synthesize;
    callbacks.onSpeechDelta?.(""); // clear; text now appears in step with audio
    let nextHandle = synth(segments[0] ?? "");
    let revealed = ""; // text shown so far — segments accumulate as they're spoken
    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) return; // cancelled — stop before painting/speaking more
      if (canvas[i]) executeCanvasAction(canvas[i]); // paint widget instantly
      const handle = await nextHandle;
      if (i + 1 < segments.length) nextHandle = synth(segments[i + 1]); // prefetch
      // Fire-and-forget word reveal paced to this clip; it runs concurrently
      // with playback below, both spanning the same duration → in sync.
      typeToTicker(segments[i], callbacks, handle.durationMs, revealed);
      if (segments[i]) revealed += (revealed ? " " : "") + segments[i];
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
      if (signal?.aborted) return; // cancelled — don't paint or speak this segment
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
  callbacks: ConverseCallbacks,
  signal?: AbortSignal,
): Promise<ConverseResult> {
  useCanvasStore.setState({ isAISpeaking: true });
  try {
    return await _converse(history, callbacks, signal);
  } finally {
    useCanvasStore.setState({ isAISpeaking: false });
  }
}

async function _converse(
  history: ModelMessage[],
  callbacks: ConverseCallbacks,
  signal?: AbortSignal,
): Promise<ConverseResult> {
  const context = useProjectStore.getState().getActiveContext();
  const result = streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(context),
    messages: history,
    temperature: 0.7,
    abortSignal: signal,
  });

  let rawBuffer = "";
  let lastLiveSpeech = "";

  // Stream the answer live: extract the `speech` field from the partial JSON as
  // tokens arrive and push it to the ResponseBox, so the user sees the reply
  // forming immediately instead of staring at a frozen "thinking" state.
  try {
    for await (const part of result.fullStream) {
      if (signal?.aborted) break;
      if (part.type === "text-delta") {
        rawBuffer += part.text;
        callbacks.onDelta?.(rawBuffer);
        const live = extractPartialSpeech(rawBuffer);
        if (live && live !== lastLiveSpeech) {
          lastLiveSpeech = live;
          // On the audio-driven path the text is revealed later in lockstep with
          // the spoken audio — streaming it live here would race ahead of the
          // voice. Only show a live preview when there's no synthesis to pace to.
          if (!callbacks.synthesize) callbacks.onSpeechDelta?.(live);
        }
      } else if (part.type === "error") {
        throw part.error;
      }
    }
  } catch (err) {
    // A cancel aborts the stream — swallow it and return cleanly so the caller
    // can discard the turn. Re-throw anything that isn't an abort.
    if (signal?.aborted) return { spoken: "", rawJson: rawBuffer.trim() };
    throw err;
  }

  // Cancelled after the stream finished but before we paint — discard the turn
  // here so the partial buffer never spawns a (fallback) widget on the canvas.
  if (signal?.aborted) return { spoken: "", rawJson: rawBuffer.trim() };

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
      await playSyncResponse({ speech: spoken, canvas: parsed.canvas }, callbacks, signal);
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
    if (signal?.aborted) return { spoken: "", rawJson: json };
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
      callbacks,
      signal,
    );
  }

  return { spoken, rawJson: json };
}
