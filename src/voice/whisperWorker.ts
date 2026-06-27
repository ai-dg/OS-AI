/// <reference lib="webworker" />
/**
 * Whisper STT Web Worker.
 *
 * Whisper-tiny.en inference is the slow, blocking step between releasing the
 * mic and seeing the prompt processed. Running it on the main thread froze the
 * page during transcription. Here the model lives in the worker; the main
 * thread decodes the clip to 16 kHz mono Float32 and ships it over (zero-copy
 * transfer) for off-thread transcription.
 */
import { pipeline, env } from "@huggingface/transformers";

type Transcriber = (
  audio: Float32Array,
  opts?: Record<string, unknown>,
) => Promise<{ text: string }>;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let pipePromise: Promise<Transcriber> | null = null;

function getPipe(): Promise<Transcriber> {
  if (!pipePromise) {
    env.allowLocalModels = false; // fetch weights from the HF hub
    pipePromise = (pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        // fp32 avoids the broken quantized MatMulNBits path in onnxruntime-web.
        dtype: "fp32",
        device: "wasm",
        progress_callback: (p: { status?: string; progress?: number }) => {
          if (p?.status === "progress" && typeof p.progress === "number") {
            ctx.postMessage({
              type: "progress",
              message: `Loading model… ${Math.round(p.progress)}%`,
            });
          }
        },
      },
    ) as unknown as Promise<Transcriber>)
      .then((t) => {
        ctx.postMessage({ type: "ready" });
        return t;
      })
      .catch((err) => {
        ctx.postMessage({ type: "load-error", message: String(err?.message ?? err) });
        pipePromise = null;
        throw err;
      });
  }
  return pipePromise;
}

ctx.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (data?.type === "warm") {
    getPipe().catch(() => {});
    return;
  }
  if (data?.type === "transcribe") {
    const { id, audio } = data as { id: number; audio: Float32Array };
    try {
      const t = await getPipe();
      const out = await t(audio);
      ctx.postMessage({ type: "result", id, text: out?.text ?? "" });
    } catch (err) {
      ctx.postMessage({
        type: "error",
        id,
        message: String((err as Error)?.message ?? err),
      });
    }
  }
};
