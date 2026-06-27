import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { Canvas } from "@/canvas/Canvas";
import { ResponseBox } from "@/components/ResponseBox";
import { ConversationTree } from "@/tree/ConversationTree";
import { useSpeechRecognition } from "@/voice/useSpeech";
import { converse } from "@/ai/converse";
import { hasApiKey } from "@/ai/client";
import { useCanvasStore } from "@/store/canvasStore";
import { useTreeStore } from "@/store/treeStore";

type Status = "idle" | "listening" | "thinking" | "speaking";

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responseShown, setResponseShown] = useState(false);
  const historyRef = useRef<ModelMessage[]>([]);
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const clearCanvas = useCanvasStore((s) => s.clear);
  const snapshot = useCanvasStore((s) => s.snapshot);
  const commit = useTreeStore((s) => s.commit);

  // Queue sentences so TTS plays them in order.
  const speak = useCallback(
    (sentence: string) => {
      if (!speechSupported) return;
      const u = new SpeechSynthesisUtterance(sentence);
      u.rate = 1.05;
      u.onstart = () => setStatus("speaking");
      window.speechSynthesis.speak(u);
    },
    [speechSupported]
  );

  const handleUtterance = useCallback(
    async (text: string) => {
      if (!hasApiKey) {
        setError("Set VITE_ANTHROPIC_API_KEY in .env.local and reload.");
        return;
      }
      setError(null);
      setStatus("thinking");
      setResponseText("");
      setResponseShown(true);
      window.speechSynthesis?.cancel();

      historyRef.current.push({ role: "user", content: text });
      try {
        const { spoken, rawJson } = await converse(historyRef.current, {
          onSentence: (sentence) => speak(sentence),
          onSpeechDelta: (text) => setResponseText(text),
        });
        // Store raw JSON as the assistant message so Claude retains canvas context.
        historyRef.current.push({ role: "assistant", content: rawJson });
        commit({
          userText: text,
          aiSummary: spoken,
          snapshot: snapshot(),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setStatus("idle");
        setResponseShown(false);
      }
    },
    [speak, commit, snapshot]
  );

  const { supported, listening, start, stop } =
    useSpeechRecognition(handleUtterance);

  useEffect(() => {
    setStatus(listening ? "listening" : (s) => (s === "listening" ? "idle" : s));
  }, [listening]);

  // Space = push to talk, Escape = clear canvas.
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e.target)) {
        e.preventDefault();
        start();
      } else if (e.code === "Escape") {
        clearCanvas();
        window.speechSynthesis?.cancel();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [start, stop, clearCanvas]);

  return (
    <div className="relative h-full w-full select-none">
      <Canvas
        onSubmit={handleUtterance}
        isThinking={status === "thinking" || status === "speaking"}
      />
      <ConversationTree />
      <ResponseBox text={responseText} shown={responseShown} />

      {/* Mic / status orb */}
      <div className="fixed inset-x-0 bottom-8 z-30 flex flex-col items-center gap-3">
        <StatusOrb status={status} />
        <p className="text-xs text-gray-500">
          {supported
            ? "Hold Space to talk · Esc to clear"
            : "Speech recognition not supported in this browser"}
        </p>
      </div>

      {(error || !hasApiKey) && (
        <div className="fixed left-1/2 top-6 z-40 -translate-x-1/2 rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error ?? "No API key — set VITE_ANTHROPIC_API_KEY in .env.local"}
        </div>
      )}
    </div>
  );
}

function StatusOrb({ status }: { status: Status }) {
  const color =
    status === "listening"
      ? "bg-sky-400"
      : status === "thinking"
        ? "bg-amber-400"
        : status === "speaking"
          ? "bg-emerald-400"
          : "bg-gray-600";
  const pulse = status !== "idle";
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      {pulse && (
        <span
          className={`absolute h-16 w-16 animate-ping rounded-full ${color} opacity-30`}
        />
      )}
      <span className={`h-5 w-5 rounded-full ${color} transition-colors`} />
    </div>
  );
}
