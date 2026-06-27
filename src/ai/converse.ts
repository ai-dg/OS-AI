import { streamText } from "ai";
import type { ModelMessage } from "ai";
import { anthropic, MODEL } from "./client";
import { SYSTEM_PROMPT } from "./systemPrompt";
import {
  dispatchWidgetDeclarations,
  dispatchCameraAction,
  type WidgetDeclaration,
  type CameraAction,
} from "./orchestrate";
import { useCanvasStore } from "@/store/canvasStore";
import type { WidgetType } from "@/widgets/types";

export interface ConverseCallbacks {
  /** Fires once per completed sentence — drives TTS from here. */
  onSentence: (sentence: string) => void;
  /** Fires on every delta of the raw stream — for a live in-progress ticker. */
  onDelta?: (partial: string) => void;
  /** Fires whenever the extracted speech text grows — drives the ResponseBox. */
  onSpeechDelta?: (speechText: string) => void;
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

function typeToTicker(sentence: string, callbacks: ConverseCallbacks): void {
  let accumulated = "";

  function clearTicker(): void {
    accumulated = "";
    callbacks.onSpeechDelta?.("");
  }

  function appendWordToTicker(word: string): void {
    accumulated += (accumulated ? " " : "") + word;
    callbacks.onSpeechDelta?.(accumulated);
  }

  clearTicker();

  const words = sentence.split(" ");
  words.forEach((word, i) => {
    setTimeout(() => {
      appendWordToTicker(word);
    }, i * 250);
  });
}

function playSyncResponse(
  { speech, canvas }: { speech: string; canvas: SyncCanvasAction[] },
  callbacks: ConverseCallbacks
): Promise<void> {
  const segments = speech.split("|");

  if (segments.length !== canvas.length) {
    console.warn(
      `Sync mismatch: speech segments=${segments.length} canvas actions=${canvas.length}`
    );
  }

  if (segments.length === 0) return Promise.resolve();

  // Track when the last word of the last segment will finish so the Promise
  // resolves only after the full visual sequence completes.
  let lastWordFiresAt = 0;

  segments.forEach((segment, i) => {
    // Each beat starts after all previous sentences have finished reading.
    const previousSegments = segments.slice(0, i);
    const delay = previousSegments.reduce((acc, seg) => {
      const wordCount = seg.trim().split(" ").filter(Boolean).length || 1;
      return acc + wordCount * 250 + 300;
    }, 0);

    setTimeout(() => {
      // Spawn widget on the first word of the sentence.
      if (canvas[i]) executeCanvasAction(canvas[i]);
      // Type the sentence word by word, starting at the same moment.
      if (segment.trim()) typeToTicker(segment.trim(), callbacks);
    }, delay);

    const wordCount = segment.trim().split(" ").filter(Boolean).length || 1;
    const segmentLastWord = delay + (wordCount - 1) * 250;
    if (segmentLastWord > lastWordFiresAt) lastWordFiresAt = segmentLastWord;
  });

  return new Promise<void>((resolve) => {
    setTimeout(resolve, lastWordFiresAt + 50);
  });
}

// ─── Streaming speech extractor ───────────────────────────────────────────────

const SENTENCE_RE = /([.!?]+)/;

function extractStreamingSpeech(buf: string): { text: string; done: boolean } {
  for (const key of ['"speech"', '"reasoning_canvas_strategy"']) {
    const keyIdx = buf.indexOf(key);
    if (keyIdx === -1) continue;

    const colonIdx = buf.indexOf(":", keyIdx + key.length);
    if (colonIdx === -1) continue;

    let i = colonIdx + 1;
    while (i < buf.length && (buf[i] === " " || buf[i] === "\n" || buf[i] === "\r")) i++;
    if (i >= buf.length || buf[i] !== '"') continue;
    i++;

    let text = "";
    while (i < buf.length) {
      const ch = buf[i];
      if (ch === "\\") {
        i++;
        if (i < buf.length) {
          const esc = buf[i];
          text += esc === "n" ? "\n" : esc === "t" ? "\t" : esc === "r" ? "\r" : esc;
        }
      } else if (ch === '"') {
        return { text, done: true };
      } else {
        text += ch;
      }
      i++;
    }
    return { text, done: false };
  }
  return { text: "", done: false };
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
  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages: history,
    temperature: 0.7,
  });

  let rawBuffer = "";
  let emittedSpeechLen = 0;
  let sentenceBuf = "";

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      rawBuffer += part.text;
      callbacks.onDelta?.(rawBuffer);

      const { text: speechSoFar } = extractStreamingSpeech(rawBuffer);
      const newChars = speechSoFar.slice(emittedSpeechLen);
      if (newChars) {
        emittedSpeechLen = speechSoFar.length;
        callbacks.onSpeechDelta?.(speechSoFar);
        sentenceBuf += newChars;

        let match: RegExpMatchArray | null;
        while (
          (match = sentenceBuf.match(SENTENCE_RE)) &&
          match.index !== undefined
        ) {
          const end = match.index + match[0].length;
          const sentence = sentenceBuf.slice(0, end).trim();
          sentenceBuf = sentenceBuf.slice(end).trimStart();
          if (sentence) callbacks.onSentence(sentence);
        }
      }
    } else if (part.type === "error") {
      throw part.error;
    }
  }

  const tail = sentenceBuf.trim();
  if (tail) callbacks.onSentence(tail);

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
      // New synchronised format — speech segments fire in lock-step with canvas actions.
      await playSyncResponse({ speech: spoken, canvas: parsed.canvas }, callbacks);
    } else if (Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
      // Legacy Visual Translation Framework format.
      dispatchWidgetDeclarations(parsed.widgets);
      if (parsed.camera) dispatchCameraAction(parsed.camera);
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
