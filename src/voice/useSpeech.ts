import { useCallback, useEffect, useRef, useState } from "react";

/** Speech-to-text via the Web Speech API (push-to-talk). */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  // Live transcription shown while the user holds the mic (finals + interim).
  const [liveText, setLiveText] = useState("");
  // Last recognition error code (e.g. "network", "service-not-allowed") so the
  // UI can explain why nothing is being transcribed (common in Chromium builds
  // that lack Google's speech backend).
  const [error, setError] = useState<string | null>(null);
  // On-screen diagnostic of the last recognition event (temporary).
  const [debug, setDebug] = useState("idle");
  const recRef = useRef<SpeechRecognition | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // Accumulated final segments + last interim for the current hold, so the whole
  // utterance is submitted once on release instead of fragmented per-segment.
  const finalsRef = useRef("");
  const interimRef = useRef("");

  // True while the user is holding the mic open. Lets us restart recognition
  // if the engine ends on silence/timeout before the key is released.
  const wantOnRef = useRef(false);
  // True between the engine's "start" and "end" events — the single source of
  // truth used to make start()/restart idempotent and avoid InvalidStateError.
  const runningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Watchdog: the Google backend can hang after audioend (no result, no end),
  // leaving the engine stuck. This force-aborts so the next press still works.
  const hangTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live mic amplitude (0–1) from a Web Audio analyser. Independent of the
  // speech service, so the orb reacts to the voice even if transcription fails.
  const levelRef = useRef(0);
  const decayRafRef = useRef(0);
  // True between speechstart/soundstart and speechend/audioend → orb pulses live.
  const speakingRef = useRef(false);

  const supported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supported) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition!;
    const rec = new Ctor();
    rec.lang = "en-US";
    // continuous=false: some Chrome builds never return results with continuous
    // recognition; single-shot mode is restarted on each onend while held.
    rec.continuous = false;
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
      console.log("[voice] onresult", { finalText, interimText });
      setDebug((d) => `${d} result`.slice(-90));
      if (hangTimerRef.current) clearTimeout(hangTimerRef.current);
      levelRef.current = 1; // pulse the orb on each recognised chunk
      if (finalText) {
        finalsRef.current = `${finalsRef.current} ${finalText}`.trim();
      }
      interimRef.current = interimText;
      setLiveText(`${finalsRef.current} ${interimText}`.trim());
    };
    rec.onend = () => {
      console.log("[voice] onend, wantOn=", wantOnRef.current);
      setDebug((d) => `${d} end`.slice(-90));
      runningRef.current = false;
      if (hangTimerRef.current) clearTimeout(hangTimerRef.current);
      // The engine can stop on its own (silence/timeout) while the key is still
      // held — restart it so push-to-talk keeps listening until release. Restart
      // is DEFERRED: calling start() synchronously inside onend throws
      // InvalidStateError because the engine hasn't fully reset yet.
      if (wantOnRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!wantOnRef.current || runningRef.current) return;
          try {
            rec.start();
          } catch {
            /* will be retried on the next onend if still held */
          }
        }, 200);
        return;
      }
      setListening(false);
      // Released: submit the whole utterance once, then reset.
      const combined = `${finalsRef.current} ${interimRef.current}`.trim();
      finalsRef.current = "";
      interimRef.current = "";
      setLiveText("");
      if (combined) onFinalRef.current(combined);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.log("[voice] onerror", e.error, e);
      setDebug((d) => `${d} err:${e.error}`.slice(-90));
      setError(e.error || "unknown");
      setListening(false);
    };
    recRef.current = rec;
    const target = rec as unknown as EventTarget;
    // Authoritative running flag: set on the engine's own "start" event.
    target.addEventListener("start", () => {
      runningRef.current = true;
    });
    // Trace the recognition lifecycle and drive the orb from speech spans.
    for (const name of [
      "audiostart",
      "soundstart",
      "speechstart",
      "speechend",
      "soundend",
      "audioend",
      "nomatch",
    ]) {
      target.addEventListener(name, () => {
        console.log("[voice]", name);
        setDebug((d) => `${d} ${name}`.slice(-90));
        // Drive the orb from recognition events (no separate mic stream): keep
        // it energised for the whole span the engine reports active speech.
        if (name === "soundstart" || name === "speechstart") speakingRef.current = true;
        if (name === "speechend" || name === "soundend" || name === "audioend")
          speakingRef.current = false;
        // After the engine finishes capturing, the result/end should arrive
        // quickly. If neither does, the backend hung → force-abort to recover.
        if (name === "audioend") {
          if (hangTimerRef.current) clearTimeout(hangTimerRef.current);
          hangTimerRef.current = setTimeout(() => {
            if (runningRef.current) {
              console.log("[voice] watchdog: no result/end after audioend → abort");
              setDebug((d) => `${d} hang→abort`.slice(-90));
              try {
                rec.abort();
              } catch {
                /* ignore */
              }
              runningRef.current = false;
            }
          }, 1500);
        }
      });
    }
    return () => {
      wantOnRef.current = false;
      runningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      rec.abort();
    };
  }, [supported]);

  // ── Orb energy decay loop (no getUserMedia — avoids stealing the mic from the
  //    recognizer). Recognition events bump levelRef; this eases it back down. ─
  const startDecay = useCallback(() => {
    cancelAnimationFrame(decayRafRef.current);
    let osc = 0;
    const tick = () => {
      if (speakingRef.current) {
        // Live, organic pulsing while the engine hears speech.
        osc += 0.35;
        levelRef.current = 0.5 + 0.5 * Math.abs(Math.sin(osc));
      } else {
        levelRef.current *= 0.9;
        if (levelRef.current < 0.002) levelRef.current = 0;
      }
      decayRafRef.current = requestAnimationFrame(tick);
    };
    decayRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopDecay = useCallback(() => {
    cancelAnimationFrame(decayRafRef.current);
    levelRef.current = 0;
  }, []);

  const start = useCallback(() => {
    if (!recRef.current) return;
    wantOnRef.current = true;
    setError(null);
    setDebug("start()");
    // Fresh hold → reset the accumulated transcript from the previous utterance.
    finalsRef.current = "";
    interimRef.current = "";
    setLiveText("");
    setListening(true);
    // Idempotent: never call start() on an already-running engine (that throws
    // InvalidStateError). If it's still running from a prior cycle, the existing
    // session already keeps the mic open.
    if (!runningRef.current) {
      try {
        recRef.current.start();
        setDebug((d) => `${d} ok`.slice(-90));
      } catch (err) {
        // Engine is mid-teardown; onend's deferred restart will recover.
        setDebug((d) => `${d} threw:${(err as Error).name}`.slice(-90));
      }
    } else {
      setDebug((d) => `${d} already-running`.slice(-90));
    }
    startDecay();
  }, [startDecay]);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
    // Recovery: if the engine is hung and never fires onend, force-reset so the
    // next press can start a fresh session instead of "already running".
    setTimeout(() => {
      if (runningRef.current) {
        try {
          recRef.current?.abort();
        } catch {
          /* ignore */
        }
        runningRef.current = false;
      }
    }, 800);
    setListening(false);
    stopDecay();
  }, [stopDecay]);

  useEffect(
    () => () => {
      cancelAnimationFrame(decayRafRef.current);
    },
    [],
  );

  return { supported, listening, liveText, error, debug, start, stop, levelRef };
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
