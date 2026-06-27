import { streamText } from "ai";
import type { ModelMessage } from "ai";
import { anthropic, MODEL } from "./client";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { dispatchCanvasCommands, type CanvasCommand } from "./orchestrate";

export interface ConverseCallbacks {
  /** Fires once per completed sentence — drive the ticker + TTS from here. */
  onSentence: (sentence: string) => void;
  /** Fires on every delta of the raw stream — for a live in-progress ticker. */
  onDelta?: (partial: string) => void;
}

export interface ConverseResult {
  /** The spoken text extracted from the "speech" field — store this in history. */
  spoken: string;
  /** The raw JSON string — push as the assistant message so Claude keeps context. */
  rawJson: string;
}

const SENTENCE_RE = /([.!?]+)/;

/**
 * Scans a growing JSON buffer and extracts the value of the "speech" field
 * character by character, handling JSON escape sequences. Returns how much of
 * the speech value has been decoded so far, and whether the closing quote was
 * reached (meaning the field is complete).
 */
function extractStreamingSpeech(buf: string): { text: string; done: boolean } {
  const keyIdx = buf.indexOf('"speech"');
  if (keyIdx === -1) return { text: "", done: false };

  const colonIdx = buf.indexOf(":", keyIdx + 8);
  if (colonIdx === -1) return { text: "", done: false };

  // Skip whitespace after colon to find the opening quote.
  let i = colonIdx + 1;
  while (i < buf.length && (buf[i] === " " || buf[i] === "\n" || buf[i] === "\r"))
    i++;
  if (i >= buf.length || buf[i] !== '"') return { text: "", done: false };
  i++; // skip opening quote

  let text = "";
  while (i < buf.length) {
    const ch = buf[i];
    if (ch === "\\") {
      i++;
      if (i < buf.length) {
        const esc = buf[i];
        if (esc === "n") text += "\n";
        else if (esc === "t") text += "\t";
        else if (esc === "r") text += "\r";
        else text += esc; // covers \" \\ \/ and unicode (simplified)
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

/**
 * Runs one assistant turn using the JSON-contract protocol:
 *   1. Streams Claude's response, buffering the full JSON.
 *   2. Extracts the "speech" field live as tokens arrive, emitting completed
 *      sentences immediately so TTS and the ticker feel instant.
 *   3. Once streaming ends, parses the JSON and dispatches canvas commands.
 *
 * On malformed JSON the speech is surfaced as-is and a fallback text widget
 * is spawned so the screen is never blank.
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

      // Extract and stream the speech field as tokens arrive.
      const { text: speechSoFar } = extractStreamingSpeech(rawBuffer);
      const newChars = speechSoFar.slice(emittedSpeechLen);
      if (newChars) {
        emittedSpeechLen = speechSoFar.length;
        sentenceBuf += newChars;

        // Emit completed sentences for TTS.
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

  // Emit any speech fragment that didn't end with punctuation.
  const tail = sentenceBuf.trim();
  if (tail) callbacks.onSentence(tail);

  // Parse full JSON and dispatch canvas commands.
  let spoken = "";
  const json = rawBuffer.trim();

  try {
    const parsed = JSON.parse(json) as {
      speech?: string;
      canvas?: CanvasCommand[];
    };
    spoken = parsed.speech ?? "";
    if (Array.isArray(parsed.canvas) && parsed.canvas.length > 0) {
      dispatchCanvasCommands(parsed.canvas);
    }
  } catch {
    // Malformed JSON — surface raw text and spawn a fallback widget.
    spoken = json.slice(0, 300);
    dispatchCanvasCommands([
      {
        action: "spawn",
        type: "text",
        id: "fallback",
        x: 15,
        y: 25,
        w: 70,
        h: 40,
        data: { text: json },
      },
    ]);
  }

  return { spoken, rawJson: json };
}
