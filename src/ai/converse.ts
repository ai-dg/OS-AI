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
import { gmailAgent } from "./gmailAgent";

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

  // ── Audio-driven path: instant paint, gap-free voice ──────────────────────
  // The answer text is already on screen (streamed live during generation), so
  // here we only (a) paint each segment's widget immediately — no waiting on
  // audio — and (b) play its narration, prefetching the next clip so playback
  // has no gaps. Synthesis runs in a worker, so nothing blocks the UI.
  if (callbacks.synthesize) {
    const synth = callbacks.synthesize;
    // Make sure the full reply is shown even on the fallback path, where it was
    // never streamed live.
    callbacks.onSpeechDelta?.(segments.join(" ").replace(/\s+/g, " ").trim());
    let nextHandle = synth(segments[0] ?? "");
    for (let i = 0; i < segments.length; i++) {
      if (canvas[i]) executeCanvasAction(canvas[i]); // paint widget instantly
      const handle = await nextHandle;
      if (i + 1 < segments.length) nextHandle = synth(segments[i + 1]); // prefetch
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

// ─── Gmail intent detection + routing ────────────────────────────────────────

const GMAIL_PATTERNS = [
  /\b(check|show|fetch|get|read|open|see|view)\s+(my\s+)?(email|emails|inbox|mail|messages?|gmail)\b/i,
  /\bmy\s+(email|inbox|gmail)\b/i,
  /\b(latest|new|recent|unread)\s+(email|emails|mail|messages?)\b/i,
  /\bemail\s+(from|to|about)\b/i,
  /\b(send|reply\s+to|compose|forward)\s+.*(email|mail|message)\b/i,
  /\bwho\s+(emailed|messaged|wrote)\b/i,
  /\bshow\s+me\s+my\s+email\b/i,
];

export function isGmailIntent(text: string): boolean {
  return GMAIL_PATTERNS.some((re) => re.test(text));
}

async function speak(text: string, callbacks: ConverseCallbacks): Promise<void> {
  callbacks.onSpeechDelta?.(text);
  if (callbacks.synthesize) {
    const handle = await callbacks.synthesize(text);
    await handle.play();
  } else {
    callbacks.onSentence(text);
  }
}

async function handleGmailConverse(
  userText: string,
  callbacks: ConverseCallbacks
): Promise<ConverseResult> {
  const store = useCanvasStore.getState();
  const WIDGET_ID = "gmail-inbox";

  const isUnread = /unread/i.test(userText);
  const isSearch = /search|find|look\s+for/i.test(userText);
  const countMatch = userText.match(/\b(\d+)\s+email/i);
  const count = countMatch ? Math.min(20, parseInt(countMatch[1], 10)) : 5;

  // ── Phase 1: announce + spawn skeleton immediately ────────────────────────
  const opening = isSearch
    ? "Searching your emails now."
    : isUnread
    ? "Fetching your unread emails."
    : "Checking your inbox.";

  await speak(opening, callbacks);

  store.clear();
  store.spawn({
    id:   WIDGET_ID,
    type: "email-ui",
    x: 5, y: 10, w: 90, h: 72,
    data: { isLoading: true, emails: [] },
  });
  store.zoomCamera(WIDGET_ID, 1.2);

  // ── Phase 2: fetch real data, update widget in place ─────────────────────
  const result = isUnread
    ? await gmailAgent.fetchUnread(count)
    : await gmailAgent.fetchInbox(count);

  let spoken: string;

  if (result.error && result.emails.length === 0) {
    store.despawn(WIDGET_ID);
    store.resetCamera();
    store.spawn({
      id:   "gmail-error",
      type: "card",
      x: 20, y: 20, w: 60, h: 40,
      data: { title: "Gmail unavailable", body: result.error },
    });
    spoken = `I couldn't reach Gmail. ${result.error}`;
  } else {
    store.update(WIDGET_ID, {
      data: {
        isLoading:   false,
        emails:      result.emails,
        unreadCount: result.unreadCount,
        selectedId:  null,
      },
    });
    const n = result.emails.length;
    const u = result.unreadCount;
    spoken = n === 0
      ? "Your inbox is empty."
      : `Loaded ${n} email${n !== 1 ? "s" : ""}${u > 0 ? `, ${u} unread` : ""}.`;
  }

  await speak(spoken, callbacks);
  const rawJson = JSON.stringify({ speech: `${opening} ${spoken}`, canvas: [], gmail: true });
  return { spoken: `${opening} ${spoken}`, rawJson };
}

// ─── Main conversation entry point ────────────────────────────────────────────

/**
 * Runs one assistant turn:
 *
 *   1. Checks for Gmail intent — if detected, routes to handleGmailConverse()
 *      which does a two-phase canvas update (skeleton → real data) via the
 *      Gmail MCP agent rather than streaming Claude directly.
 *   2. Otherwise streams Claude's JSON response, buffering the full text.
 *   3. Extracts the "speech" field live as tokens arrive, emitting completed
 *      sentences immediately for TTS and the ResponseBox.
 *   4. Once streaming ends, parses the full JSON.
 *      - If the response has a `canvas` array  → playSyncResponse (new sync format)
 *        Each "|"-separated speech segment fires in lock-step with its canvas action.
 *      - If the response has a `widgets` array → dispatchWidgetDeclarations (legacy VTF)
 *   5. On malformed JSON, a fallback text widget is spawned so the canvas is never blank.
 */
export async function converse(
  history: ModelMessage[],
  callbacks: ConverseCallbacks
): Promise<ConverseResult> {
  // ── Gmail intent fast path ────────────────────────────────────────────────
  const lastMsg  = history[history.length - 1];
  const userText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
  if (isGmailIntent(userText)) {
    return handleGmailConverse(userText, callbacks);
  }

  const context = useProjectStore.getState().getActiveContext();
  const result = streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(context),
    messages: history,
    temperature: 0.7,
  });

  let rawBuffer = "";
  let lastLiveSpeech = "";

  // Stream the answer live: extract the `speech` field from the partial JSON as
  // tokens arrive and push it to the ResponseBox, so the user sees the reply
  // forming immediately instead of staring at a frozen "thinking" state.
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      rawBuffer += part.text;
      callbacks.onDelta?.(rawBuffer);
      const live = extractPartialSpeech(rawBuffer);
      if (live && live !== lastLiveSpeech) {
        lastLiveSpeech = live;
        callbacks.onSpeechDelta?.(live);
      }
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
