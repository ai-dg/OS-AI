/**
 * DemoControls — presenter chrome for the scripted school demo.
 *
 * Renders three pieces (BUILD_PLAN.md Phase 1):
 *  - Reset Demo button (top-right) — flashes the canvas border, then resets the
 *    demo + canvas to a clean step 0. Keyboard: Ctrl/Cmd+Shift+R.
 *  - Voice-simulation button (bottom-center) — advances the demo; shows the next
 *    spoken line. Fades in 1s after load. Hidden when there's no label.
 *  - Step counter (top-right, under Reset).
 *
 * All state lives in `useDemoStore`. demoStore.reset() already clears the canvas
 * and restores fresh school data, so the button only calls reset() + flashes.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDemoStore, TOTAL_STEPS } from "@/store/demoStore";
import { useCanvasStore } from "@/store/canvasStore";

export function DemoControls() {
  const completedCount = useDemoStore((s) => s.completed.size);
  const guidedLabel = useDemoStore((s) => s.guidedLabel);
  const advanceGuided = useDemoStore((s) => s.advanceGuided);
  const reset = useDemoStore((s) => s.reset);
  const minZoomScale = useCanvasStore((s) => s.minZoomScale);
  const showFit = minZoomScale < 0.9;

  const [flash, setFlash] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);

  // Voice button fades in 1s after load (step 0 settling).
  useEffect(() => {
    const t = setTimeout(() => setVoiceReady(true), 1000);
    return () => clearTimeout(t);
  }, []);

  const doReset = useCallback(() => {
    reset();
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
  }, [reset]);

  // Ctrl/Cmd+Shift+R → Reset Demo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyR") {
        e.preventDefault();
        doReset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doReset]);

  // Hidden for now: the scripted tutorial-sentence (guided voice) button.
  const showVoice = false && voiceReady && guidedLabel !== null;

  return (
    <>
      {/* Reset Demo flash — brief white edge flash (ANIMATIONS.md). */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key="reset-flash"
            className="pointer-events-none fixed inset-0 z-[300]"
            style={{ border: "1px solid rgba(255,255,255,0.4)" }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Reset Demo button — top-right. */}
      <button
        type="button"
        onClick={doReset}
        title="Reset the demo to step 0 (Ctrl/Cmd+Shift+R)"
        className="fixed right-4 top-4 z-[200] select-none border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors duration-200 hover:bg-white/10"
      >
        ↺ Reset Demo
      </button>

      {/* Fit-all button — shown when content extends beyond the initial viewport. */}
      {showFit && (
        <button
          type="button"
          onClick={() => useCanvasStore.getState().fitAll()}
          title="Fit all content in view (Cmd+0)"
          className="fixed right-36 top-4 z-[200] select-none border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors duration-200 hover:bg-white/10 hover:text-zinc-200"
        >
          ⊡
        </button>
      )}

      {/* Step counter — under the Reset button. */}
      <span className="fixed right-4 top-14 z-[200] select-none font-mono text-[10px] text-zinc-600">
        {completedCount} / {TOTAL_STEPS}
      </span>

      {/* Voice-simulation button — bottom-center, above the tree strip. */}
      <AnimatePresence>
        {showVoice && (
          <motion.button
            key="voice-sim"
            type="button"
            onClick={advanceGuided}
            className="fixed bottom-44 left-1/2 z-[200] -translate-x-1/2 select-none whitespace-nowrap rounded-full border border-indigo-400/30 bg-indigo-500/10 px-5 py-2 font-mono text-xs text-indigo-200 transition-colors duration-200 hover:bg-indigo-500/20"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {guidedLabel}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
