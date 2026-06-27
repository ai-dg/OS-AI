import { streamText, stepCountIs, type ModelMessage } from "ai";
import { anthropic, MODEL } from "./client";
import { uiTools } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";

export interface ConverseCallbacks {
  /** Fires once per completed sentence — drive the ticker + TTS from here. */
  onSentence: (sentence: string) => void;
  /** Fires on every text delta — for a live, in-progress ticker line. */
  onDelta?: (partial: string) => void;
}

const SENTENCE_END = /([.!?]+|\n)/;

/**
 * Runs one assistant turn: streams Claude's reply, emits sentences as they
 * complete, and lets the UI tools mutate the canvas live. Returns the full
 * spoken text so the caller can store a summary in the conversation tree.
 */
export async function converse(
  history: ModelMessage[],
  callbacks: ConverseCallbacks
): Promise<string> {
  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages: history,
    tools: uiTools,
    stopWhen: stepCountIs(12),
  });

  let buffer = "";
  let full = "";

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      const delta = part.text;
      buffer += delta;
      full += delta;
      callbacks.onDelta?.(buffer);

      let match: RegExpMatchArray | null;
      while ((match = buffer.match(SENTENCE_END)) && match.index !== undefined) {
        const end = match.index + match[0].length;
        const sentence = buffer.slice(0, end).trim();
        buffer = buffer.slice(end);
        if (sentence) callbacks.onSentence(sentence);
      }
    } else if (part.type === "error") {
      throw part.error;
    }
  }

  const tail = buffer.trim();
  if (tail) callbacks.onSentence(tail);

  return full.trim();
}
