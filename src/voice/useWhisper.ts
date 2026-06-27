import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Local speech-to-text via Whisper (transformers.js) — fully in-browser, no
 * dependency on Google's Web Speech backend (which hangs in some environments).
 *
 * Push-to-talk: records mic audio while the key is held, then transcribes the
 * captured clip on release. The model (~40 MB, whisper-tiny.en) downloads once
 * from the HuggingFace CDN and is cached by the browser for subsequent runs.
 *
 * Inference runs in a dedicated Web Worker (`whisperWorker.ts`) so it never
 * blocks the main thread — the page stays responsive while a clip transcribes.
 */

// ── Whisper worker client (module singleton, shared across renders/instances) ──
type WorkerOut =
  | { type: "progress"; message: string }
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id: number; message: string };

let whisperWorker: Worker | null = null;
let whisperReqId = 0;
const whisperPending = new Map<
  number,
  { resolve: (text: string) => void; reject: (e: Error) => void }
>();
let onWhisperProgress: ((msg: string) => void) | null = null;

function getWhisperWorker(): Worker {
  if (!whisperWorker) {
    whisperWorker = new Worker(
      new URL("./whisperWorker.ts", import.meta.url),
      { type: "module" },
    );
    whisperWorker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "progress") {
        onWhisperProgress?.(m.message);
      } else if (m.type === "result") {
        const p = whisperPending.get(m.id);
        if (p) {
          whisperPending.delete(m.id);
          p.resolve(m.text);
        }
      } else if (m.type === "error" || m.type === "load-error") {
        const err = new Error(m.message);
        if ("id" in m) {
          const p = whisperPending.get(m.id);
          if (p) {
            whisperPending.delete(m.id);
            p.reject(err);
          }
        }
      }
    };
  }
  return whisperWorker;
}

/** Kick off model download in the worker so it's ready on mic release. */
function warmTranscriber(onProgress?: (msg: string) => void): void {
  if (onProgress) onWhisperProgress = onProgress;
  getWhisperWorker().postMessage({ type: "warm" });
}

/** Transcribe a 16 kHz mono clip off-thread. */
function transcribe(
  audio: Float32Array,
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (onProgress) onWhisperProgress = onProgress;
  const worker = getWhisperWorker();
  const id = ++whisperReqId;
  return new Promise<string>((resolve, reject) => {
    whisperPending.set(id, { resolve, reject });
    // Transfer the audio buffer (zero-copy); we don't reuse it afterwards.
    worker.postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
}

/** Decode a recorded clip to mono 16 kHz Float32 — the format Whisper expects. */
async function blobTo16kMono(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const decodeCtx = new AC();
  const decoded = await decodeCtx.decodeAudioData(buf);
  await decodeCtx.close();

  const rate = 16000;
  const frames = Math.max(1, Math.ceil(decoded.duration * rate));
  const offline = new OfflineAudioContext(1, frames, rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  // Copy out of the AudioBuffer so the backing buffer is safe to transfer to
  // the worker.
  return new Float32Array(rendered.getChannelData(0));
}

export function useWhisper(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // Mic amplitude (0–1) for the orb.
  const levelRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // True between start() and stop(); guards against a tap released before the
  // mic permission / stream resolves.
  const heldRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef(0);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
      const src = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        levelRef.current = Math.max(0, Math.min(1, (rms - 0.01) * 11));
        meterRafRef.current = requestAnimationFrame(tick);
      };
      meterRafRef.current = requestAnimationFrame(tick);
    } catch {
      levelRef.current = 0;
    }
  }, []);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(meterRafRef.current);
    analyserRef.current?.disconnect();
    levelRef.current = 0;
  }, []);

  const start = useCallback(async () => {
    heldRef.current = true;
    setError(null);
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      // Released during the permission prompt / await → don't start recording.
      if (!heldRef.current) {
        setListening(false);
        return;
      }
      const stream = streamRef.current;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopMeter();
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        if (blob.size === 0) {
          setListening(false);
          setLiveText("");
          return;
        }
        try {
          setLiveText("Transcribing…");
          const audio = await blobTo16kMono(blob);
          const text = (await transcribe(audio, setLiveText)).trim();
          setListening(false);
          setLiveText("");
          if (text && text !== "[BLANK_AUDIO]") onFinalRef.current(text);
        } catch (err) {
          console.error("[whisper] transcription failed", err);
          setError("transcription failed");
          setListening(false);
          setLiveText("");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setListening(true);
      setLiveText("Listening…");
      startMeter(stream);
      // Warm up the model in the background so it's ready on release.
      warmTranscriber((m) =>
        setLiveText((t) => (t === "Listening…" ? m : t)),
      );
    } catch (err) {
      console.error("[whisper] mic access failed", err);
      setError("mic access failed");
      setListening(false);
    }
  }, [startMeter, stopMeter]);

  const stop = useCallback(() => {
    heldRef.current = false;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // → onstop → transcription
    } else {
      setListening(false);
    }
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(meterRafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  return { supported, listening, liveText, error, start, stop, levelRef };
}
