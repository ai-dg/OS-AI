import { useCallback, useEffect, useRef, useState } from "react";

/** Speech-to-text via the Web Speech API (push-to-talk). */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // True while the user is holding the mic open. Lets us restart recognition
  // if the engine ends on silence/timeout before the key is released.
  const wantOnRef = useRef(false);

  // Live mic amplitude (0–1), updated by a Web Audio analyser while listening.
  // Exposed as a ref so the orb can read it every animation frame without
  // triggering React re-renders.
  const levelRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRafRef = useRef(0);

  const supported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supported) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition!;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) finalText += text;
        else interimText += text;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        onFinalRef.current(finalText.trim());
      }
    };
    rec.onend = () => {
      // The engine can stop on its own (silence/timeout) while the key is still
      // held — restart it so push-to-talk keeps listening until release.
      if (wantOnRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* still tearing down — fall through and drop listening state */
        }
      }
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      wantOnRef.current = false;
      rec.abort();
    };
  }, [supported]);

  // ── Mic amplitude meter (optional eye-candy; never blocks recognition) ────
  const startMeter = useCallback(async () => {
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = new Ctx();
        const src = audioCtxRef.current.createMediaStreamSource(streamRef.current);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.65;
        src.connect(analyser);
        analyserRef.current = analyser;
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      const analyser = analyserRef.current!;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Map typical speech RMS (~0.03–0.2) to a punchy 0–1 with a small noise
        // floor and high gain so even normal speaking drives a strong reaction.
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
    levelRef.current = 0;
  }, []);

  const start = useCallback(() => {
    if (!recRef.current) return;
    wantOnRef.current = true;
    setListening(true);
    try {
      recRef.current.start();
    } catch {
      // Already running or still ending a prior session — onend restarts it
      // because wantOnRef is true, so the mic still ends up active.
    }
    void startMeter();
  }, [startMeter]);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    recRef.current?.stop();
    setListening(false);
    stopMeter();
  }, [stopMeter]);

  // Release mic + audio graph on unmount.
  useEffect(
    () => () => {
      cancelAnimationFrame(meterRafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  return { supported, listening, interim, start, stop, levelRef };
}

/** Text-to-speech via the Web Speech API. */
export function useSpeechSynthesis() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [supported]
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, speak, cancel };
}
