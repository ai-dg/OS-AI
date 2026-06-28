/**
 * Demo Store — state machine for the scripted school demo.
 *
 * Phase 0 scaffolding: holds the step counter, the voice-simulation button
 * label, and the completion flag, plus a working `reset()` that returns the
 * whole app to a clean step 0. The full `DEMO_STEPS` sequence (each step's
 * `onEnter()` spawning widgets directly via the canvas store) lands in Phase 3.
 *
 * See .claude/docs/DEMO_SCRIPT.md and BUILD_PLAN.md (Phase 3).
 */

import { create } from "zustand";
import { useCanvasStore } from "@/store/canvasStore";
import { useProjectStore } from "@/projects/projectStore";

/** Voice-button label shown before step 1 (the demo's opening line). */
const FIRST_LABEL = '🎤 "What do I need to do today?"';

/** Number of scripted steps (0–8 inclusive on the counter). */
export const TOTAL_STEPS = 8;

export interface DemoState {
  /** Current step index, 0–8. */
  currentStep: number;
  /** Label on the voice-simulation button, or null when hidden. */
  voiceButtonLabel: string | null;
  /** True once the final beat is reached. */
  isComplete: boolean;

  /** Advance to the next step (runs that step's onEnter in Phase 3). */
  advance: () => void;
  /** Return to step 0 with a clean canvas and fresh school data. */
  reset: () => void;

  /** QCM widget submit callback — re-shows the next voice button (Phase 3). */
  onQCMComplete: (answers: Record<number, number>) => void;
  /** Mail compose send callback (Phase 3). */
  onMailSent: () => void;
  /** Dialog yes/no callback (Phase 3). */
  handleDialogAction: (action: string) => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  currentStep: 0,
  voiceButtonLabel: FIRST_LABEL,
  isComplete: false,

  // Phase 3 wires the real per-step onEnter() logic. For now advance just
  // bumps the counter so the scaffolding is observable end-to-end.
  advance: () =>
    set((s) => {
      const next = Math.min(s.currentStep + 1, TOTAL_STEPS);
      return { currentStep: next, isComplete: next >= TOTAL_STEPS };
    }),

  reset: () => {
    useCanvasStore.getState().clear();
    useProjectStore.getState().reset();
    set({ currentStep: 0, voiceButtonLabel: FIRST_LABEL, isComplete: false });
  },

  // Phase 3 fills these in. Stubbed now so Phase 2 widgets can wire to a stable
  // API surface without breaking the build.
  onQCMComplete: () => {},
  onMailSent: () => {},
  handleDialogAction: () => {},
}));
