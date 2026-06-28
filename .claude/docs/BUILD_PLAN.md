# Build Plan — School Demo Implementation

Read this before writing any code. This is the implementation order for the JARVIS school demo.
Build in this sequence — each phase leaves the demo in a runnable state.

> **Stack note (read first).** React 18 + Vite + TS, **Zustand** stores (`canvasStore`,
> `treeStore`, `projectStore`, new `demoStore`), **Tailwind v4** + **Framer Motion** for UI,
> **Vercel AI SDK `streamText`** with the single-JSON `{ speech, canvas }` contract (NOT tool
> calling — there is **no** `tools.ts`). Voice = ElevenLabs TTS + Whisper/WebSpeech STT. Import
> with the `@/` alias. Scripted steps drive `useCanvasStore.getState().spawn(...)` directly via
> `demoStore`; only live free-form turns go through `converse()`. Store methods: `spawn`,
> `despawn`, `clear`, `zoomCamera` (there is no `clearAll` — it's `clear`).

---

## Phase 0 — Data Foundation
*Build first. Everything else depends on this.*

**Files to create/modify:**
1. `src/projects/schoolData.ts` — create from scratch using SCHOOL_DATA.md and PROJECTS.md spec
   - `Teacher`, `Homework`, `QCMData`, `LessonData`, `EssayData`, `SchoolProject` interfaces
   - `createDefaultSchoolData()` — returns the 3 pre-seeded projects (history/maths/english)
   - `computeProgress(homework)` — computes 0–100 based on homework type
   - Export everything

2. `src/store/demoStore.ts` — create Zustand store for demo state machine
   ```ts
   interface DemoStore {
     currentStep: number           // 0–8
     voiceButtonLabel: string      // text shown on simulate button
     isComplete: boolean
     advance: () => void           // runs next step's onEnter()
     reset: () => void             // returns to step 0, clears everything
     onQCMComplete: (answers: Record<number, number>) => void
     onMailSent: () => void
   }
   ```

3. `src/projects/projectStore.ts` — update (or create if not yet built):
   - Replace generic email/code/hackathon projects with `createDefaultSchoolData()`
   - Add `updateHomeworkData(projectId, homeworkId, patch)` method
   - Add `reset()` that calls `createDefaultSchoolData()` and clears history/canvas/tree

**Verify:** `computeProgress` returns 60 for history QCM (3/7 answered), 0 for maths lesson, 100 for english essay.

---

## Phase 1 — Demo Controls
*The Reset Demo button and voice simulation button. Must work before any content.*

**Files to create/modify:**
1. `src/components/DemoControls.tsx` — new component, renders two elements:

   **Reset Demo button** (top-right of canvas):
   ```tsx
   <button
     className="reset-demo-btn"
     onClick={() => { demoStore.reset(); canvasStore.clearAll(); }}
   >
     ↺ Reset Demo
   </button>
   ```
   Style: `position: absolute; top: 16px; right: 16px; z-index: 200`
   On click: flash canvas border (see ANIMATIONS.md → Reset Demo Flash), then call both stores' reset.
   Keyboard: `Cmd+Shift+R` / `Ctrl+Shift+R`

   **Voice Simulation button** (bottom-center, above tree strip):
   ```tsx
   <button
     className="voice-sim-btn"
     onClick={() => demoStore.advance()}
   >
     {demoStore.voiceButtonLabel}
   </button>
   ```
   Style: `position: absolute; bottom: 96px; left: 50%; transform: translateX(-50%); z-index: 200`
   Hidden in step 0 until 1s after load (fade in).

   **Step counter** (bottom-right):
   ```tsx
   <span className="step-counter">{currentStep} / 8</span>
   ```

2. Wire `DemoControls` into `Canvas.tsx` or `App.tsx` at root level.

**Verify:** Clicking Reset restores black canvas. Voice button shows `🎤 "What do I need to do today?"`. Step counter shows `0 / 8`.

---

## Phase 2 — Widget Types (new)
*Build all 5 new widget types as standalone components. Test each in isolation.*

### 2a — `TaskList.tsx`
Build from WIDGETS.md → `task-list` spec.
- Progress bar fills from 0 on spawn (use a `useEffect` with a 50ms delay to trigger CSS transition)
- Urgent due label in amber `#f59e0b`
- 100% task: green progress bar `#34d399`, checkmark suffix on due label

### 2b — `QCMWidget.tsx`
Build from WIDGETS.md → `qcm` spec.
- Internal state: `currentIndex`, `selectedAnswer`, `confirmedAnswers` (seeded from `preAnswered`)
- Start at `startAtQuestion` on mount
- Feedback: correct = green border/bg, wrong = red + also show correct in green
- Navigation: Prev/Next, Next → Submit on last question
- On Submit: call `demoStore.onQCMComplete(confirmedAnswers)`
- Progress bar in header updates as student answers

### 2c — `LessonWidget.tsx`
Build from WIDGETS.md → `lesson` spec. This is the most complex component.

Split into sub-components:
- `LessonSVGCanvas.tsx` — SVG drawing area, takes current beat and renders accordingly
- `LessonNarration.tsx` — right panel, shows instruction text + OK prompt

SVG drawing:
- Maintain a list of "drawn elements" in component state
- Each beat adds to this list — shapes accumulate, they don't replace each other
- Use `stroke-dashoffset` animation via CSS transitions (set `strokeDasharray` + `strokeDashoffset` then transition to 0)
- For highlights: keep a `highlightedSegment` state, render duplicate path with glow filter

Beat advancement:
- Only advances when OK button is clicked (or `demoStore.advance()` is called)
- After OK: save new `currentBeat` to `projectStore.updateHomeworkData()`
- On final beat (equation): no OK — show "Lesson complete" badge, call nothing

### 2d — `MailCompose.tsx`
Build from WIDGETS.md → `mail-compose` spec.
- Body is a `<textarea>` — editable for realism
- Attachment pills are display-only
- On Send: play sent animation (see ANIMATIONS.md), then call `demoStore.onMailSent()`
- Gmail MCP call is best-effort (see AI_CONTRACT.md)

### 2e — `Dialog.tsx`
Simple. Build from WIDGETS.md → `dialog` spec.
- On action click: call `demoStore.handleDialogAction(action)`, then self-despawn

### Register all new types:
In `src/widgets/types.ts`, add to `WidgetType` union.
In `src/widgets/registry.tsx`, add cases for each new type.

**Verify:** Render each widget in isolation with mock data. Check animations fire.

---

## Phase 3 — Demo Step State Machine
*Wire the full 8-step sequence.*

In `src/store/demoStore.ts`, implement `DEMO_STEPS` array:

```ts
const DEMO_STEPS: DemoStep[] = [
  {
    label: null,   // Step 0 — no voice button
    onEnter: () => {
      canvasStore.clearAll()
      projectStore.reset()
      // nothing else — black screen
    }
  },
  {
    label: '🎤 "What do I need to do today?"',
    onEnter: () => {
      ticker.say("Good morning, Alex. Here's where you're at today.")
      // Spawn 3 task-list widgets with 80ms stagger
      // See DEMO_SCRIPT.md Step 1 for exact widget data
    }
  },
  {
    label: '🎤 "Let\'s start with the History homework we started yesterday"',
    onEnter: () => {
      canvasStore.clearAll()
      triggerProjectSwitch('history')  // scan-line wipe
      ticker.say("Picking up where you left off. Question 4 of 7.")
      // Spawn qcm widget — see DEMO_SCRIPT.md Step 2
      // Voice button hides until QCM submit fires demoStore.onQCMComplete()
    }
  },
  // ... steps 3a, 3b, 4, 5 per DEMO_SCRIPT.md
]
```

`advance()`:
- Increments `currentStep`
- Calls `DEMO_STEPS[currentStep].onEnter()`
- Updates `voiceButtonLabel` to `DEMO_STEPS[currentStep + 1]?.label ?? null`

`reset()`:
- Sets `currentStep = 0`
- Calls `DEMO_STEPS[0].onEnter()`
- Sets `voiceButtonLabel` to `DEMO_STEPS[1].label`

**Special step gates (steps that don't advance on button click alone):**
- Step 2 (QCM): button is hidden after entering; re-shows when `onQCMComplete()` fires
- Step 5 (Lesson beats): each OK advances a beat sub-index, not the main step counter
  - Sub-beats: 4 OK presses to complete all 5 beats (beat 0 is auto, beats 1–4 need OK)
  - After beat 4: lesson complete → voice button disappears

**Verify:** Stepping through 0→1→2, QCM completes, 3a→3b→4→5, lesson beats all fire.

---

## Phase 4 — Scan-line Wipe & Project Switch
*Wire the transition used in Steps 2 and 4.*

In `src/components/` (or `src/canvas/`), implement `ScanLine.tsx`:
- Animated `<div>` that sweeps top to bottom when triggered
- Controlled by a `scanlineActive` boolean in canvas store or local state
- After scan completes: callback fires to load new project's content

In `projectStore.setActiveProject(id)`:
1. Save current project state
2. Trigger scan-line animation
3. After 400ms: update `activeProjectId`, update system prompt context
4. After 450ms: spawn new project's `canvasState` widgets with stagger
5. After 500ms: update project label

**Verify:** Pressing `Cmd+1`/`Cmd+2`/`Cmd+3` triggers clean scan-line wipe.

---

## Phase 5 — System Prompt & Contract Integration
*Wire schoolData into the AI layer. There is NO `tools.ts` — Claude drives the canvas through the
`{ speech, canvas }` JSON contract (see AI_CONTRACT.md).*

In `src/projects/projectStore.ts`:
- `getActiveContext()` returns the active class + teacher (name/email) + homework with
  `computeProgress()` — this is what `converse.ts` passes to `buildSystemPrompt(...)`.

In `src/ai/systemPrompt.ts`:
- Confirm `buildSystemPrompt(projectContext?)` appends the project context.
- Add catalog entries (friendly type name, `data` schema, size guide, example) for any new widget
  Claude is allowed to spawn live (`task-list`, `qcm`, `mail-compose`, …). Demo-only widgets that
  are spawned solely by `demoStore` don't strictly need a catalog entry.

In `src/ai/converse.ts` / `src/ai/orchestrate.ts`:
- Ensure the friendly→internal type maps (`SYNC_TYPE_MAP` / `TYPE_MAP`) include the new widget
  type names so `{ speech, canvas }` spawns resolve correctly.

Project switching is handled by `projectStore.setActiveProject(id)` (Phase 4) — not an AI tool.

**Verify:** Ask Claude "what do I have to do today?" in live mode → it returns a `{ speech, canvas }`
response that spawns `task-list` widgets.

---

## Phase 6 — Polish Pass
*Make the demo feel alive.*

Checklist:
- [ ] All ticker text streams at 25ms/char (not instant)
- [ ] Task card progress bars animate in on spawn (not instant fill)
- [ ] QCM question transitions slide (not cut)
- [ ] Lesson SVG draws smoothly — no jump from 0 to full stroke
- [ ] Mail sent animation plays before widget disappears
- [ ] Reset Demo returns to a pixel-perfect step 0 with zero artifacts
- [ ] Project label fades in correctly on switch (600ms)
- [ ] Step counter always accurate
- [ ] Voice button always visible above tree strip
- [ ] Particle bg runs without performance issues (`document.hidden` guard)

---

## File Creation Summary

New files to create (in addition to updating existing ones):
```
src/projects/schoolData.ts         ← Phase 0
src/store/demoStore.ts             ← Phase 0
src/components/DemoControls.tsx    ← Phase 1
src/widgets/TaskList.tsx           ← Phase 2a
src/widgets/QCMWidget.tsx          ← Phase 2b
src/widgets/LessonWidget.tsx       ← Phase 2c
src/widgets/LessonSVGCanvas.tsx    ← Phase 2c (sub-component)
src/widgets/LessonNarration.tsx    ← Phase 2c (sub-component)
src/widgets/MailCompose.tsx        ← Phase 2d
src/widgets/Dialog.tsx             ← Phase 2e
```

Existing files to update:
```
src/widgets/types.ts               ← add 5 new WidgetType values
src/widgets/registry.tsx           ← add 5 new renderers to the WIDGETS map
src/projects/projectStore.ts       ← replace project data, add reset() + getActiveContext()
src/ai/systemPrompt.ts             ← add new widget catalog entries (live-spawnable ones)
src/ai/converse.ts / orchestrate.ts ← add new friendly→internal type-map entries
src/store/demoStore.ts             ← new (Phase 0) — also drives canvasStore spawns per step
src/App.tsx                        ← mount DemoControls, wire scan-line / project switch
```
(There is no `src/ai/tools.ts` — the app uses the `{ speech, canvas }` JSON contract, not AI-SDK
tool calling.)

---

## Definition of Done

The demo is complete when:
1. `Reset Demo` from any state returns to perfect step 0 with no artifacts
2. All 8 steps advance correctly via the voice simulation button
3. QCM widget can be answered (Q4–Q7) and submitted
4. Mail compose widget appears with correct teacher data and plays sent animation
5. Maths dialog appears and "Yes, show me" triggers the lesson
6. Lesson widget draws the triangle, highlights all 3 sides, reveals the equation
7. Each lesson beat requires an OK confirm before proceeding
8. The entire demo runs in under 4 minutes from step 0 to final equation
