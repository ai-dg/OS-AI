import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { Canvas } from "@/canvas/Canvas";
import { ResponseBox } from "@/components/ResponseBox";
import { ProjectLabel } from "@/components/ProjectLabel";
import { ConversationTree } from "@/tree/ConversationTree";
import { JarvisOrb } from "@/components/JarvisOrb";
import { useSpeechRecognition } from "@/voice/useSpeech";
import { converse } from "@/ai/converse";
import { hasApiKey } from "@/ai/client";
import { useCanvasStore } from "@/store/canvasStore";
import { useTreeStore } from "@/store/treeStore";
import { useProjectStore } from "@/projects/projectStore";

type Status = "idle" | "listening" | "thinking" | "speaking" | "switching";

// ── Voice command detection ───────────────────────────────────────────────────
// Intercepts utterances like "switch to code review" before they reach Claude.

function detectProjectSwitch(
  text: string,
  projects: Record<string, { name: string }>,
): string | null {
  const lower = text.toLowerCase().trim();
  const m = lower.match(
    /^(?:switch|go|open|load)\s+(?:to\s+)?(.+?)(?:\s+project|\s+mode)?$/,
  );
  if (!m) return null;
  const needle = m[1].trim();
  for (const [id, proj] of Object.entries(projects)) {
    const pname     = proj.name.toLowerCase();
    const firstWord = pname.split(/\s+/)[0];
    if (pname.includes(needle) || needle.includes(firstWord)) return id;
  }
  return null;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [error,        setError]        = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responseShown, setResponseShown] = useState(false);
  const historyRef    = useRef<ModelMessage[]>([]);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const clearCanvas   = useCanvasStore((s) => s.clear);
  const snapshot      = useCanvasStore((s) => s.snapshot);
  const widgetCount   = useCanvasStore((s) => s.order.length);
  const commit        = useTreeStore((s) => s.commit);
  const isSwitching   = useProjectStore((s) => s.isSwitching);
  const switchProject = useProjectStore((s) => s.switchProject);
  const saveProject   = useProjectStore((s) => s.saveCurrentProject);
  const projects      = useProjectStore((s) => s.projects);

  // ── Restore active project canvas on first mount ──────────────────────────
  useEffect(() => {
    const { activeProject } = useProjectStore.getState();
    const proj = activeProject();
    if (proj.canvasState) {
      useCanvasStore.getState().restore(proj.canvasState);
    }
    if (proj.tree.length > 0) {
      useTreeStore.getState().seed(proj.tree);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist on tab close ──────────────────────────────────────────────────
  useEffect(() => {
    const save = () => saveProject(historyRef.current);
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, [saveProject]);

  // ── Reflect isSwitching in status orb ────────────────────────────────────
  useEffect(() => {
    if (isSwitching) setStatus("switching");
    else setStatus((s) => (s === "switching" ? "idle" : s));
  }, [isSwitching]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speak = useCallback((sentence: string) => {
    if (!speechSupported) return;
    const u = new SpeechSynthesisUtterance(sentence);
    u.rate = 1.05;
    u.onstart = () => setStatus("speaking");
    window.speechSynthesis.speak(u);
  }, [speechSupported]);

  // ── Project switch ────────────────────────────────────────────────────────
  const doSwitch = useCallback(async (targetId: string) => {
    window.speechSynthesis?.cancel();
    setStatus("switching");
    const newHistory = await switchProject(targetId, historyRef.current);
    historyRef.current = newHistory;
  }, [switchProject]);

  // ── Main utterance handler ────────────────────────────────────────────────
  const handleUtterance = useCallback(async (text: string) => {
    if (!hasApiKey) {
      setError("Set VITE_ANTHROPIC_API_KEY in .env.local and reload.");
      return;
    }
    setError(null);

    const switchTarget = detectProjectSwitch(text, projects);
    if (switchTarget) { await doSwitch(switchTarget); return; }

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
      historyRef.current.push({ role: "assistant", content: rawJson });
      commit({ userText: text, aiSummary: spoken, snapshot: snapshot() });
      saveProject(historyRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStatus("idle");
      setResponseShown(false);
    }
  }, [speak, commit, snapshot, doSwitch, saveProject, projects]);

  const { supported, listening, start, stop, levelRef } =
    useSpeechRecognition(handleUtterance);

  useEffect(() => {
    setStatus(listening ? "listening" : (s) => (s === "listening" ? "idle" : s));
  }, [listening]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Space = PTT  |  Escape = clear canvas  |  Alt+1/2/3 = switch project
  // Alt+digit is used (not Ctrl+digit) because Ctrl+1/2/3 is reserved by the
  // browser for tab-switching on Linux/Windows. e.code is layout-independent.
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

    const down = (e: KeyboardEvent) => {
      // Alt+1-3 → switch project
      if (e.altKey && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
        e.preventDefault();
        const ids = Object.keys(useProjectStore.getState().projects);
        const targetId = ids[parseInt(e.code.slice(-1), 10) - 1];
        if (targetId && targetId !== useProjectStore.getState().activeProjectId) {
          doSwitch(targetId);
        }
        return;
      }
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
  }, [start, stop, clearCanvas, doSwitch]);

  return (
    <div className="relative h-full w-full select-none">
      <Canvas
        onSubmit={handleUtterance}
        isThinking={status === "thinking" || status === "speaking"}
        voiceLevelRef={levelRef}
      />
      <ProjectLabel />
      <ConversationTree />
      <ResponseBox text={responseText} shown={responseShown} />

      {/* Mic / status orb — only during a conversation; the home page shows the
          full-screen hero orb instead, so the small one is hidden there. */}
      <div className="fixed inset-x-0 bottom-[96px] z-30 flex flex-col items-center gap-3">
        {widgetCount > 0 && (
          <StatusOrb status={status} inConversation levelRef={levelRef} />
        )}
        <p className="text-xs text-gray-500">
          {supported
            ? "Hold Space · Esc clear · Alt+1/2/3 switch project"
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

// ── Status orb ────────────────────────────────────────────────────────────────

// Voice-status → orb tint. Idle stays teal but dim; active states brighten
// and shift hue so the mic indicator reads at a glance.
const STATUS_COLOR: Record<Status, [number, number, number]> = {
  idle:      [45, 212, 191],  // teal
  listening: [56, 189, 248],  // sky
  thinking:  [251, 191, 36],  // amber
  speaking:  [52, 211, 153],  // emerald
  switching: [167, 139, 250], // violet
};

function StatusOrb({
  status,
  inConversation = false,
  levelRef,
}: {
  status: Status;
  inConversation?: boolean;
  levelRef?: { current: number };
}) {
  const color = STATUS_COLOR[status];
  // During a conversation the idle hero orb is gone, so the small mic needs a
  // floor of brightness + a ringed backdrop to stay clearly visible over widgets.
  const intensity = status === "idle" ? (inConversation ? 0.85 : 0.55) : 1;
  const [r, g, b] = color;
  const size = inConversation ? 92 : 80;

  return (
    <div
      className="relative flex items-center justify-center rounded-full transition-all duration-300"
      style={{
        height: size + 16,
        width: size + 16,
        ...(inConversation
          ? {
              background: `radial-gradient(circle, rgba(${r},${g},${b},0.08) 0%, transparent 70%)`,
              border: `1px solid rgba(${r},${g},${b},0.25)`,
              boxShadow: `0 0 24px rgba(${r},${g},${b},0.20)`,
            }
          : {}),
      }}
    >
      <JarvisOrb size={size} color={color} intensity={intensity} levelRef={levelRef} />
    </div>
  );
}
