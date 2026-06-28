import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { Canvas } from "@/canvas/Canvas";
import { ResponseBox } from "@/components/ResponseBox";
import { DemoControls } from "@/components/DemoControls";
import { ConversationTree } from "@/tree/ConversationTree";
import { JarvisOrb } from "@/components/JarvisOrb";
import { useWhisper } from "@/voice/useWhisper";
import { AudioSynthesisService } from "@/voice/AudioSynthesisService";
import { converse } from "@/ai/converse";
import { routeIntent, signalsTopicSwitch, type RouterContext } from "@/ai/intentRouter";
import { hasApiKey } from "@/ai/client";
import { useCanvasStore } from "@/store/canvasStore";
import { useTreeStore } from "@/store/treeStore";
import { useProjectStore } from "@/projects/projectStore";
import { setDemoNarrator, useDemoStore } from "@/store/demoStore";

type Status = "idle" | "listening" | "thinking" | "speaking" | "switching";

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [error,        setError]        = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [responseShown, setResponseShown] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const historyRef    = useRef<ModelMessage[]>([]);
  // Aborts the in-flight assistant turn when the user cancels (Ctrl+C).
  const abortRef      = useRef<AbortController | null>(null);
  // Latest status, readable from the (stable) keyboard handler without re-binding.
  const statusRef     = useRef<Status>("idle");
  statusRef.current   = status;

  // Text-to-speech service: ElevenLabs cloud voice + sentence queue. Once.
  const ttsRef = useRef<AudioSynthesisService | null>(null);
  if (!ttsRef.current) {
    ttsRef.current = new AudioSynthesisService({
      onSpeakingChange: (speaking) =>
        setStatus((s) =>
          speaking ? "speaking" : s === "speaking" ? "idle" : s,
        ),
      onVoiceLoading: (msg) => setVoiceLoading(msg),
    });
  }

  const clearCanvas   = useCanvasStore((s) => s.clear);
  const snapshot      = useCanvasStore((s) => s.snapshot);
  const widgetCount   = useCanvasStore((s) => s.order.length);
  const commit        = useTreeStore((s) => s.commit);
  const isSwitching   = useProjectStore((s) => s.isSwitching);
  const switchProject = useProjectStore((s) => s.switchProject);
  const saveProject   = useProjectStore((s) => s.saveCurrentProject);
  const resetNodes    = useProjectStore((s) => s.resetNodes);

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

  // ── Demo narrator ─────────────────────────────────────────────────────────
  // Lets scripted demo steps (demoStore) speak + show text through the same TTS
  // path as live mode. Pass "" to clear the response display.
  useEffect(() => {
    setDemoNarrator((text: string) => {
      ttsRef.current?.cancel();
      if (!text) {
        setResponseShown(false);
        setResponseText("");
        return;
      }
      setResponseText(text);
      setResponseShown(true);
      text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((sentence) => ttsRef.current?.queueSentence(sentence));
    });
    return () => setDemoNarrator(() => {});
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

  // ── Project switch ────────────────────────────────────────────────────────
  const doSwitch = useCallback(async (targetId: string) => {
    ttsRef.current?.cancel();
    setStatus("switching");
    const newHistory = await switchProject(targetId, historyRef.current);
    historyRef.current = newHistory;
  }, [switchProject]);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  // Silences AI narration without changing anything else — the on-screen text
  // and widgets still appear normally. Handy while programming / running tests.
  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      ttsRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // ── reset_node ────────────────────────────────────────────────────────────
  // Delete every conversation-tree node — in-memory and persisted across all
  // projects. Destructive + survives reload, so confirm first.
  const handleResetNodes = useCallback(() => {
    if (!window.confirm("Delete every node? This clears the conversation tree across all projects and cannot be undone.")) {
      return;
    }
    resetNodes();
  }, [resetNodes]);

  // ── Cancel the in-flight AI turn ──────────────────────────────────────────
  // Ctrl+C while the AI is answering: stop the voice, abort the stream, and
  // discard the whole turn — the canvas goes blank, and the node is never
  // committed to the tree or persisted (handled in handleUtterance's catch).
  const cancelResponse = useCallback(() => {
    abortRef.current?.abort();
    ttsRef.current?.cancel();
    clearCanvas();
    setResponseShown(false);
    setStatus("idle");
  }, [clearCanvas]);

  // ── Main utterance handler ────────────────────────────────────────────────
  const handleUtterance = useCallback(async (text: string) => {
    if (!hasApiKey) {
      setError("Set VITE_ANTHROPIC_API_KEY in .env.local and reload.");
      return;
    }
    setError(null);

    // ── Agent 1: Intent Router ────────────────────────────────────────────────
    // Runs first on EVERY input. Classifies the utterance to a feature (in any
    // order) or free-form. Two agents are independent: the Router decides what to
    // do; the Tracker (inside demoStore) observes what was done.
    setStatus("thinking");
    const ps = useProjectStore.getState();
    const cw = useCanvasStore.getState().widgets;
    const routerCtx: RouterContext = {
      activeProjectId: ps.activeProjectId,
      projects: Object.values(ps.projects).map((p) => ({ id: p.id, name: p.name })),
      homeworks: Object.values(ps.projects).flatMap((p) =>
        p.homeworks.map((h) => ({
          id: h.id,
          projectId: p.id,
          subject: p.name,
          type: h.type,
          title: h.title,
        })),
      ),
      // A lesson is "active" while its intro dialog or the lesson widget is on canvas.
      lessonActive: Boolean(cw["maths-dialog"] || cw["lesson-pythagoras"]),
    };
    const { intent, params } = await routeIntent(text, routerCtx);

    // The Router detects topic switches; on one, clear the tutor's comprehension
    // state (the student has moved off the lesson topic). Staying in the lesson
    // (lesson-advance / a free-form question) keeps the state intact.
    if (signalsTopicSwitch(intent)) useDemoStore.getState().clearComprehension();

    // Project switch keeps the animated scan-line path (projectStore.switchProject).
    if (intent === "switch-project" && params.projectId) {
      await doSwitch(params.projectId);
      return;
    }

    // ── in-lesson turn → the Lesson Tutor (owns the 4-way decision) ───────────
    // While the lesson widget is live, EVERY student turn — a question, "I don't
    // get it", or even an affirmation — goes to the tutor, which decides to deepen,
    // reframe, confirm+advance, or clarify. Affirmations are deliberately NOT
    // auto-advanced here: a vague "ok" is a weak signal the tutor checks first.
    const inLesson = Boolean(useCanvasStore.getState().widgets["lesson-pythagoras"]);
    if (inLesson && (intent === "lesson-advance" || intent === "free-form")) {
      ttsRef.current?.cancel();
      await useDemoStore.getState().lessonRespond(text);
      setStatus("idle");
      return;
    }

    // Any other feature intent → demoStore activates it directly (spawns + fires the
    // Tracker). Includes `lesson-advance` while only the intro dialog is up (starts it).
    if (intent !== "free-form") {
      ttsRef.current?.cancel();
      useDemoStore.getState().activate(intent, params);
      setStatus("idle");
      return;
    }

    // ── free-form → live Claude (main AI loop) ────────────────────────────────
    setResponseText("");
    setResponseShown(true);
    ttsRef.current?.cancel();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const userMsg: ModelMessage = { role: "user", content: text };
    historyRef.current.push(userMsg);

    try {
      const { spoken, rawJson } = await converse(
        historyRef.current,
        {
          onSentence: (sentence) => ttsRef.current?.queueSentence(sentence),
          onSpeechDelta: (text) => setResponseText(text),
          synthesize: (text) => ttsRef.current!.synthesize(text),
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) throw new DOMException("cancelled", "AbortError");
      historyRef.current.push({ role: "assistant", content: rawJson });
      commit({ userText: text, aiSummary: spoken, snapshot: snapshot() });
      saveProject(historyRef.current);
    } catch (e) {
      if (ctrl.signal.aborted) {
        // Cancelled turn — drop the user message so it's never persisted, and
        // leave the canvas blank (cancelResponse already cleared it).
        historyRef.current = historyRef.current.filter((m) => m !== userMsg);
        clearCanvas();
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setStatus("idle");
      setResponseShown(false);
    }
  }, [commit, snapshot, doSwitch, saveProject, clearCanvas]);

  const { supported, listening, transcribing, start, stop, levelRef, liveText, error: voiceError } =
    useWhisper(handleUtterance);

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
      // Ctrl/Cmd+C while the AI is answering → cancel the turn. Only intercepted
      // mid-answer (and not while typing), so normal copy is unaffected otherwise.
      if (
        (e.ctrlKey || e.metaKey) &&
        e.code === "KeyC" &&
        !isTyping(e.target) &&
        (statusRef.current === "thinking" || statusRef.current === "speaking")
      ) {
        e.preventDefault();
        cancelResponse();
        return;
      }
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
        ttsRef.current?.cancel();
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
  }, [start, stop, clearCanvas, doSwitch, cancelResponse]);

  return (
    <div className="relative h-full w-full select-none">
      <Canvas
        onSubmit={handleUtterance}
        isThinking={status === "thinking" || status === "speaking"}
        chatBusy={
          status === "thinking" || status === "speaking" || transcribing
        }
        voiceLevelRef={levelRef}
      />
      <ConversationTree />
      <DemoControls />

      {/* Mute toggle — silence AI narration (e.g. while programming / testing). */}
      <button
        type="button"
        onClick={toggleMuted}
        aria-pressed={muted}
        title={muted ? "Voice muted — click to enable" : "Mute AI voice"}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ${
          muted
            ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
            : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
        }`}
      >
        <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
        {muted ? "Voice off" : "Voice on"}
      </button>

      {/* reset_node — wipe every conversation-tree node (in-memory + persisted). */}
      <button
        type="button"
        onClick={handleResetNodes}
        title="Delete every conversation-tree node across all projects"
        className="fixed bottom-5 right-32 z-40 flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/5 px-3 py-1.5 text-xs text-red-300 transition-all duration-300 hover:bg-red-400/15"
      >
        <span aria-hidden>🗑</span>
        Reset nodes
      </button>

      {/* While listening, the box mirrors the live transcript of the user's
          speech; once thinking/speaking it shows Claude's response. */}
      <ResponseBox
        text={listening ? liveText || "Listening…" : responseText}
        shown={listening ? true : responseShown}
      />

      {/* Mic / status orb — only during a conversation; the home page shows the
          full-screen hero orb instead, so the small one is hidden there.
          Pinned to the bottom-right corner, just above the mute toggle. */}
      {widgetCount > 0 && (
        <div className="fixed bottom-20 right-5 z-30">
          <StatusOrb status={status} inConversation levelRef={levelRef} />
        </div>
      )}

      {/* Voice hints / status text — kept centered at the bottom. */}
      <div className="fixed inset-x-0 bottom-[152px] z-30 flex flex-col items-center gap-3">
        <p
          className={`text-xs ${
            status === "thinking" || status === "speaking"
              ? "text-amber-300/70"
              : "text-gray-500"
          }`}
        >
          {status === "thinking" || status === "speaking"
            ? "Ctrl+C to cancel"
            : supported
              ? ""
              : "Voice unavailable — type your prompt below"}
        </p>
        {voiceError && (
          <p className="text-xs text-amber-400/80">
            {voiceError === "mic access failed"
              ? "Mic blocked — allow microphone access, or press / to type."
              : "Transcription failed — try again or press / to type."}
          </p>
        )}
        {voiceLoading && (
          <p className="text-xs text-teal-300/70">{voiceLoading}</p>
        )}
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
