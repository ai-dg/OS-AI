import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Local speech-to-text via Whisper (transformers.js) — fully in-browser, no
 * dependency on Google's Web Speech backend (which hangs in some environments).
 *
 * Push-to-talk: records mic audio while the key is held, then transcribes the
 * captured clip on release. The model (~40 MB, whisper-tiny.en) downloads once
 * from the HuggingFace CDN and is cached by the browser for subsequent runs.
 */

type Transcriber = (
  audio: Float32Array,
  opts?: Record<string, unknown>,
) => Promise<{ text: string }>;

// Lazily-created singleton pipeline, shared across renders/instances.
let transcriberPromise: Promise<Transcriber> | null = null;

async function getTranscriber(
  onProgress?: (msg: string) => void,
): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false; // fetch weights from the HF hub
      const t = await pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-tiny.en",
        {
          // Full precision everywhere: the quantized (q8/q4) decoder variants of
          // this model hit a broken MatMulNBits path in onnxruntime-web. fp32 has
          // no quantization, so it always loads. Larger download but reliable.
          dtype: "fp32",
          device: "wasm",
          progress_callback: (p: {
            status?: string;
            progress?: number;
          }) => {
            if (
              onProgress &&
              p?.status === "progress" &&
              typeof p.progress === "number"
            ) {
              onProgress(`Loading model… ${Math.round(p.progress)}%`);
            }
          },
        },
      );
      return t as unknown as Transcriber;
    })();
  }
  return transcriberPromise;
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
  return rendered.getChannelData(0);
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
          const transcriber = await getTranscriber(setLiveText);
          setLiveText("Transcribing…");
          const audio = await blobTo16kMono(blob);
          const out = await transcriber(audio);
          const text = (out?.text ?? "").trim();
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
      void getTranscriber((m) =>
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
