/**
 * Demo Store — intent dispatch + Tracker-owned progress (two-agent model).
 *
 * The scripted school flow is intent-driven, not linear. On every utterance the
 * main loop (App.tsx) runs Agent 1 (Intent Router, src/ai/intentRouter.ts); a
 * feature intent calls `activate(intent, params)`, which spawns pre-authored
 * widgets directly via the canvas store (no Claude) and emits an ActivationEvent.
 * Agent 2 (Demo Progress Tracker, src/ai/progressTracker.ts) observes those
 * events asynchronously and marks demo-step IDs complete. Stateful widgets call
 * the lifecycle hooks (onQCMComplete / onMailSent / handleDialogAction), and the
 * lesson emits `mastered` once its concepts are confirmed — the events the Tracker needs.
 *
 * The lesson is a conversational tutor over a CONCEPT LIBRARY, not a slide scroll.
 * Each concept owns a set of explanations tagged by approach; there is no position
 * counter — the active concept lives in `comprehension.activeConcept`. While the
 * lesson widget is live, EVERY student turn — a question, "I don't get it", or an
 * affirmation — is routed (by App) to `lessonRespond()`, which runs the Lesson Tutor
 * (src/ai/lessonTutor.ts). The tutor picks one of four responses: `deepen` / `reframe`
 * (stay on the concept, pick a fresh explanation), `advance` (validate, then
 * `advanceConcept()` introduces the next concept), or `clarify` (a weak signal like a
 * vague "ok" or silence → ask before moving on, never auto-advance). The OK button
 * advances explicitly via `advanceLessonBeat()`. `comprehension` holds the tutor's
 * cross-turn state for the topic (the active concept + per-concept status / approaches
 * used, plus sub-questions asked); the tutor returns an updated copy each
 * turn and the store saves it. It is session-only and `clearComprehension()` resets it
 * when the Intent Router signals the student moved to a different topic.
 *
 * The Simulate-Voice button (DemoControls) bypasses the Router: `advanceGuided()`
 * activates the next uncompleted step's intent directly; the Tracker still runs.
 *
 * Widget data is pulled from the project store (single source of truth —
 * schoolData.ts) so progress is always computed.
 *
 * See .claude/docs/DEMO_SCRIPT.md and AI_CONTRACT.md (Two-Agent Architecture).
 */

import { create } from "zustand";
import { useCanvasStore } from "@/store/canvasStore";
import { useProjectStore, type Project } from "@/projects/projectStore";
import {
  computeProgress,
  type QCMData,
  type LessonData,
  type LessonConcept,
  type Homework,
} from "@/projects/schoolData";
import { trackActivation, type ActivationEvent } from "@/ai/progressTracker";
import {
  runLessonTutor,
  freshComprehension,
  introduceConcept,
  confirmConcept,
  type ComprehensionState,
} from "@/ai/lessonTutor";
import type { RoutingParams } from "@/ai/intentRouter";

// ─── Narrator injection ───────────────────────────────────────────────────────
//
// The TTS service lives in App.tsx (ttsRef). App registers a narrator here on
// mount so scripted features speak + show text through the same path as live
// mode. Defaults to a no-op so the store works headless (tests / SSR).

type Narrator = (text: string) => void;
let narrate: Narrator = () => {};

/** App registers the TTS+ResponseBox narrator. Pass "" to clear the display. */
export function setDemoNarrator(fn: Narrator): void {
  narrate = fn;
}

const canvas = () => useCanvasStore.getState();
const store = () => useProjectStore.getState();

function paramStr(params: RoutingParams | undefined, key: keyof RoutingParams, fb: string): string {
  const v = params?.[key];
  return typeof v === "string" ? v : fb;
}

// ─── Widget-data builders / spawners (pull from project store) ────────────────

const SUBJECT_ICON: Record<string, string> = { history: "📚", maths: "📐", english: "📝" };

/** Build a `task-list` widget payload from a project (progress is computed). */
function taskWidgetData(project: Project) {
  return {
    subject: project.name,
    icon: SUBJECT_ICON[project.id] ?? "📘",
    teacher: project.teacher.name,
    tasks: project.homeworks.map((h) => ({
      title: h.title,
      type: h.type,
      progress: computeProgress(h),
      dueLabel: h.dueLabel,
      urgent: h.dueDate === "today",
    })),
  };
}

/** show-todo — three task-list cards. */
function spawnOverview() {
  canvas().clear();
  useCanvasStore.setState({ isAISpeaking: true });
  narrate("Good morning, Alex. Here's where you're at today.");
  const { projects } = store();
  const layout = [
    { id: "task-history", proj: projects.history, x: 8 },
    { id: "task-maths", proj: projects.maths, x: 37 },
    { id: "task-english", proj: projects.english, x: 66 },
  ];
  layout.forEach((c, i) => {
    if (!c.proj) return;
    window.setTimeout(() => {
      canvas().spawn({ id: c.id, type: "task-list", x: c.x, y: 18, w: 26, h: 42, data: taskWidgetData(c.proj) });
    }, i * 80);
  });
  window.setTimeout(() => useCanvasStore.setState({ isAISpeaking: false }), 600);
}

/** open-homework (qcm) — resumes from saved answers. Completes on submit. */
function spawnQcm(projectId: string, hw: Homework) {
  store().setActiveProject(projectId); // clears canvas, sets the project label
  useCanvasStore.setState({ isAISpeaking: true });
  const d = hw.data as QCMData;
  narrate("Picking up where you left off. Question 4 of 7.");
  canvas().spawn({
    id: "qcm-ww2",
    type: "qcm",
    x: 12,
    y: 12,
    w: 76,
    h: 76,
    data: {
      subject: d.subject,
      totalQuestions: d.questions.length,
      startAtQuestion: Object.keys(d.answers).length,
      preAnswered: d.answers,
      questions: d.questions,
    },
  });
  window.setTimeout(() => useCanvasStore.setState({ isAISpeaking: false }), 400);
}

/** open-homework (lesson) — opens the intro dialog; the lesson widget owns its beats. */
function spawnLessonDialog(projectId: string) {
  store().setActiveProject(projectId); // clears canvas, sets the project label
  useCanvasStore.setState({ isAISpeaking: true });
  narrate("Starting Pythagoras Theorem. Want a quick visual walkthrough first?");
  canvas().spawn({
    id: "maths-dialog",
    type: "dialog",
    x: 28,
    y: 30,
    w: 44,
    h: 30,
    data: {
      title: "Pythagoras Theorem",
      icon: "📐",
      body: "Want a quick visual walkthrough of the theorem before we begin?",
      actions: [
        { label: "Skip", action: "skip-lesson" },
        { label: "Yes, show me", action: "start-lesson", primary: true },
      ],
    },
  });
  window.setTimeout(() => useCanvasStore.setState({ isAISpeaking: false }), 400);
}

/** compose-mail — pre-filled submission to the project's teacher. Completes on send. */
function spawnMail(projectId: string) {
  useCanvasStore.setState({ isAISpeaking: true });
  canvas().despawn("qcm-ww2");
  const teacher = store().projects[projectId]?.teacher ?? store().projects.history?.teacher;
  narrate(`Preparing your submission for ${teacher?.name ?? "your teacher"}. Ready to send — shall I go ahead?`);
  canvas().spawn({
    id: "mail-compose",
    type: "mail-compose",
    x: 22,
    y: 12,
    w: 56,
    h: 60,
    data: {
      to: { name: teacher?.name ?? "Ms. Martin", email: teacher?.email ?? "" },
      subject: "WW2 QCM — Alex Dupont",
      body:
        "Dear Ms. Martin,\n\n" +
        "Please find attached my completed QCM on World War 2.\n" +
        "All 7 questions answered.\n\n" +
        "Best regards,\nAlex",
      attachments: [{ name: "WW2_QCM_Alex_Dupont.pdf", type: "qcm", sourceWidgetId: "qcm-ww2" }],
      readyToSend: true,
    },
  });
  window.setTimeout(() => useCanvasStore.setState({ isAISpeaking: false }), 400);
}

// ─── Lesson helpers (concept library) ─────────────────────────────────────────

const LESSON_TOPIC = "Pythagoras Theorem";

/** The Pythagoras concept library, read from the project store (single source of truth). */
function lessonConcepts(): LessonConcept[] {
  const hw = store().projects.maths?.homeworks.find((h) => h.type === "lesson");
  return (hw?.data as LessonData | undefined)?.concepts ?? [];
}

/** Look up a concept by its key. */
function findConcept(key: string): LessonConcept | undefined {
  return lessonConcepts().find((c) => c.concept === key);
}

/** The intro explanation text for a concept (the `introApproach` variant). */
function introInstruction(concept: LessonConcept): string {
  const byApproach = concept.explanations.find((e) => e.approach === concept.introApproach);
  return (byApproach ?? concept.explanations[0])?.instruction ?? "";
}

/** The render beat the widget displays this turn — a single instruction, no sequence. */
interface LessonView {
  conceptId: string;
  instruction: string;
}

// ─── Guided fallback (canonical order for the Simulate-Voice button) ──────────

interface GuidedStep {
  /** Demo-step id the Tracker marks complete. */
  stepId: string;
  /** Phrase shown on the Simulate-Voice button. */
  label: string;
  intent: string;
  params?: RoutingParams;
  /**
   * Step IDs that should already be complete before this step is a *sensible*
   * suggestion. The Tracker enforces no order, so steps can be completed out of
   * sequence — these prerequisites keep the Simulate-Voice button from proposing
   * something that doesn't make sense yet (e.g. "send this work to my teacher"
   * before the History QCM is actually done).
   */
  requires?: string[];
}

const GUIDED: GuidedStep[] = [
  { stepId: "overview", label: '🎤 "What do I need to do today?"', intent: "show-todo" },
  {
    stepId: "history-qcm",
    label: '🎤 "Let\'s start the History homework we started yesterday"',
    intent: "open-homework",
    params: { projectId: "history", homeworkId: "hw-ww2-qcm" },
  },
  {
    stepId: "send-homework",
    label: '🎤 "Could you send this work to my teacher?"',
    intent: "compose-mail",
    params: { projectId: "history" },
    // Only logical once there's a completed QCM to attach and send.
    requires: ["history-qcm"],
  },
  {
    stepId: "maths-lesson",
    label: '🎤 "Let\'s start the Maths lesson on Pythagoras"',
    intent: "open-homework",
    params: { projectId: "maths", homeworkId: "hw-pythagoras" },
  },
];

/** Total demo steps — shown as `n / TOTAL_STEPS` in DemoControls. */
export const TOTAL_STEPS = GUIDED.length;

/**
 * The most logical next step for the Simulate-Voice button: the first
 * uncompleted step (in canonical order) whose prerequisites are all satisfied.
 * Returns null when every step is done. Because completion is order-independent,
 * this is *not* simply "the next step in sequence" — a step is only suggested
 * once it actually makes sense to do, regardless of what was skipped.
 */
function nextGuidedStep(completed: Set<string>): GuidedStep | null {
  return (
    GUIDED.find(
      (g) =>
        !completed.has(g.stepId) &&
        (g.requires ?? []).every((req) => completed.has(req)),
    ) ?? null
  );
}

/** Next logical step's label, or null when every step is done. */
function nextGuidedLabel(completed: Set<string>): string | null {
  return nextGuidedStep(completed)?.label ?? null;
}

// ─── Tracker bridge ───────────────────────────────────────────────────────────
//
// Fire-and-forget: run Agent 2 on the activation event and apply whatever steps
// it reports complete. Never awaited by the UI, so it can never block.

function emit(event: ActivationEvent): void {
  void trackActivation(event, useDemoStore.getState().completed).then((stepIds) => {
    if (stepIds.length) useDemoStore.getState().markCompleted(stepIds);
  });
}

// ─── Store ──────────────────────────────────────────────────────────────────

export interface DemoState {
  /** Demo-step IDs marked complete by the Progress Tracker (order-independent). */
  completed: Set<string>;
  /** Label on the Simulate-Voice button (next uncompleted step), or null at the end. */
  guidedLabel: string | null;
  /** True once every demo step is complete. */
  isComplete: boolean;
  /**
   * The single render beat the LessonWidget displays right now — one instruction for
   * one concept. The widget knows nothing about sequence; it just renders this.
   */
  lessonView: LessonView | null;
  /**
   * The tutor's cross-turn comprehension state for the current topic (session-only,
   * never persisted). Tracks the ACTIVE concept and, per concept, status + approaches
   * used. Updated each turn and cleared on a topic switch.
   */
  comprehension: ComprehensionState;

  /** Dispatch a router intent (Router path + scripted button). Spawns + emits an event. */
  activate: (intent: string, params?: RoutingParams) => void;
  /** Advance the active lesson — accept the intro dialog, or advance one concept. */
  advanceLesson: () => void;
  /** OK button: confirm the active concept, advance to the next, narrate its intro. */
  advanceLessonBeat: () => void;
  /**
   * Confirm the active concept and move to the next concept in the library WITHOUT
   * narrating: introduces it (→ active), sets `lessonView`, persists progress; returns
   * the next concept (or null at the end). Shared by the OK button and tutor `advance`.
   */
  advanceConcept: () => LessonConcept | null;
  /** Sync persisted progress from comprehension and emit `mastered` once concepts are confirmed. */
  syncLessonProgress: () => void;
  /**
   * Handle a student utterance during a lesson. Runs the Lesson Tutor, which picks
   * deepen / reframe / advance / clarify; narrates the reply and updates `lessonView`
   * + comprehension. Only `advance` moves to the next concept.
   */
  lessonRespond: (utterance: string) => Promise<void>;
  /**
   * Clear the comprehension state — the Intent Router signals a topic switch (the
   * student moved off the lesson topic). Called by the orchestrator (App), not the UI.
   */
  clearComprehension: () => void;
  /** Simulate-Voice button — bypasses the Router, activates the next uncompleted step. */
  advanceGuided: () => void;
  /** Tracker-only — merge newly-completed step IDs and recompute label / isComplete. */
  markCompleted: (stepIds: string[]) => void;
  /** Return to a clean slate: empty completion set, fresh school data, clear canvas. */
  reset: () => void;

  /** QCM submit — persist answers and emit a `submitted` event. */
  onQCMComplete: (answers: Record<number, number>) => void;
  /** Mail-compose send — despawn, narrate, emit a `sent` event. */
  onMailSent: () => void;
  /** Dialog yes/no — start or skip the lesson (widget-internal). */
  handleDialogAction: (action: string) => void;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  completed: new Set<string>(),
  guidedLabel: nextGuidedLabel(new Set()),
  isComplete: false,
  lessonView: null,
  comprehension: freshComprehension(LESSON_TOPIC),

  activate: (intent, params) => {
    switch (intent) {
      case "show-todo":
        spawnOverview();
        emit({ feature: "todo-overview", phase: "opened" });
        break;
      case "open-homework": {
        const projId = paramStr(params, "projectId", "history");
        const hwId = paramStr(params, "homeworkId", "");
        const proj = store().projects[projId];
        const hw =
          proj?.homeworks.find((h) => h.id === hwId) ??
          proj?.homeworks.find((h) => h.type === "qcm" || h.type === "lesson");
        if (!hw) return;
        if (hw.type === "qcm") {
          spawnQcm(projId, hw);
          emit({ feature: "qcm", phase: "opened" });
        } else if (hw.type === "lesson") {
          spawnLessonDialog(projId);
          emit({ feature: "lesson", phase: "opened" });
        }
        break;
      }
      case "compose-mail":
        spawnMail(paramStr(params, "projectId", store().activeProjectId));
        emit({ feature: "mail-compose", phase: "opened" });
        break;
      case "lesson-advance":
        get().advanceLesson();
        break;
      default:
        // switch-project / free-form are handled by App — no-op here.
        break;
    }
  },

  advanceLesson: () => {
    const widgets = useCanvasStore.getState().widgets;
    if (widgets["maths-dialog"]) {
      // Intro dialog still up — "yes/continue" accepts it and starts the lesson.
      get().handleDialogAction("start-lesson");
      return;
    }
    if (widgets["lesson-pythagoras"]) {
      // Lesson on canvas — affirmation means "I've got this idea, go on".
      get().advanceLessonBeat();
    }
  },

  advanceConcept: () => {
    const concepts = lessonConcepts();
    const active = get().comprehension.activeConcept;
    const idx = concepts.findIndex((c) => c.concept === active);

    // Confirm the concept they're leaving, then sync persisted progress.
    set((s) => ({ comprehension: confirmConcept(s.comprehension, active) }));
    get().syncLessonProgress();

    const next = idx >= 0 ? concepts[idx + 1] : concepts[0];
    if (!next) return null; // already on the final concept

    // Introduce the next concept (→ active) and hand the widget its render beat.
    const instruction = introInstruction(next);
    set((s) => ({
      comprehension: introduceConcept(s.comprehension, next.concept, next.introApproach),
      lessonView: { conceptId: next.concept, instruction },
    }));
    useProjectStore.getState().updateHomeworkData("maths", "hw-pythagoras", { activeConceptId: next.concept });
    get().syncLessonProgress(); // reaching the final concept can complete the step
    return next;
  },

  // OK button / explicit click: advance one concept and narrate its intro.
  advanceLessonBeat: () => {
    const next = get().advanceConcept();
    if (next) narrate(introInstruction(next));
  },

  syncLessonProgress: () => {
    const concepts = lessonConcepts();
    if (!concepts.length) return;
    const confirmed = get()
      .comprehension.concepts.filter((c) => c.status === "confirmed")
      .map((c) => c.concept);
    useProjectStore.getState().updateHomeworkData("maths", "hw-pythagoras", { confirmedConceptIds: confirmed });

    // The lesson is "mastered" once its concepts are confirmed understood. Reaching the
    // final concept means every prior one was confirmed to get there (advance confirms),
    // so that — or confirming the final concept, or confirming all — completes the step.
    // Comprehension-driven, not position: you cannot reach here without understanding.
    const terminal = concepts[concepts.length - 1]?.concept;
    const active = get().comprehension.activeConcept;
    const mastered =
      active === terminal || (!!terminal && confirmed.includes(terminal)) || confirmed.length >= concepts.length;
    if (mastered && !get().completed.has("maths-lesson")) {
      emit({ feature: "lesson", phase: "mastered" });
    }
  },

  lessonRespond: async (utterance) => {
    const active = get().comprehension.activeConcept;
    const concept = findConcept(active) ?? lessonConcepts()[0];
    if (!concept) return;

    // Hand the tutor the active concept + comprehension state; it picks one of four
    // responses (deepen / reframe / advance / clarify) and returns the updated state.
    const reply = await runLessonTutor({ concept, state: get().comprehension, utterance });
    set({ comprehension: reply.state });

    if (reply.mode === "advance") {
      // Validate, then introduce the next concept — one narration so TTS doesn't clobber itself.
      const next = get().advanceConcept();
      narrate(next ? `${reply.say} ${introInstruction(next)}` : reply.say);
    } else {
      // deepen / reframe / clarify stay on the concept; the spoken text IS the render beat.
      set({ lessonView: { conceptId: concept.concept, instruction: reply.say } });
      narrate(reply.say);
      get().syncLessonProgress(); // a meaningful follow-up (deepen) confirms the concept
    }
  },

  clearComprehension: () => set({ comprehension: freshComprehension(LESSON_TOPIC), lessonView: null }),

  advanceGuided: () => {
    // Mirror the button's label exactly: act on the most logical next step
    // (dependency-aware), not merely the next one in array order.
    const step = nextGuidedStep(get().completed);
    if (!step) return; // everything done
    get().activate(step.intent, step.params);
  },

  markCompleted: (stepIds) =>
    set((s) => {
      const completed = new Set(s.completed);
      stepIds.forEach((id) => completed.add(id));
      return {
        completed,
        guidedLabel: nextGuidedLabel(completed),
        isComplete: completed.size >= TOTAL_STEPS,
      };
    }),

  reset: () => {
    useProjectStore.getState().reset(); // fresh school data + clears canvas/tree
    canvas().clear();
    // Ensure camera is fully reset to origin with no lock.
    useCanvasStore.setState({ isAISpeaking: false, cameraOffsetX: 0, cameraOffsetY: 0, cameraZoomScale: 1 });
    narrate("");
    set({
      completed: new Set<string>(),
      guidedLabel: nextGuidedLabel(new Set()),
      isComplete: false,
      lessonView: null,
      comprehension: freshComprehension(LESSON_TOPIC),
    });
  },

  onQCMComplete: (answers) => {
    // Persist the student's answers back to the history homework (single source
    // of truth) so any later progress read reflects the completed quiz.
    useProjectStore.getState().updateHomeworkData("history", "hw-ww2-qcm", { answers });
    emit({ feature: "qcm", params: { subject: "history" }, phase: "submitted" });
  },

  onMailSent: () => {
    canvas().despawn("mail-compose");
    narrate("Sent. Ms. Martin will receive it shortly. Your WW2 QCM has been submitted.");
    emit({ feature: "mail-compose", phase: "sent" });
  },

  handleDialogAction: (action) => {
    if (action === "start-lesson") {
      canvas().despawn("maths-dialog");
      const hw = store().projects.maths?.homeworks[0]?.data as LessonData | undefined;
      if (!hw) return;
      const concepts = hw.concepts ?? [];
      const first = concepts.find((c) => c.concept === hw.activeConceptId) ?? concepts[0];
      canvas().spawn({
        id: "lesson-pythagoras",
        type: "lesson",
        x: 8,
        y: 10,
        w: 84,
        h: 80,
        data: {
          subject: hw.subject,
          concepts: hw.concepts,
          projectId: "maths",
          homeworkId: "hw-pythagoras",
        },
      });
      // Begin the conversation: fresh comprehension (new topic), introduce the first
      // concept (→ active), hand the widget its first render beat, and speak it.
      set({
        comprehension: first
          ? introduceConcept(freshComprehension(LESSON_TOPIC), first.concept, first.introApproach)
          : freshComprehension(LESSON_TOPIC),
        lessonView: first ? { conceptId: first.concept, instruction: introInstruction(first) } : null,
      });
      if (first) narrate(introInstruction(first));
    } else if (action === "skip-lesson") {
      narrate("No problem — the lesson is saved to your Maths folder.");
      emit({ feature: "lesson", phase: "skipped" });
    }
  },
}));
