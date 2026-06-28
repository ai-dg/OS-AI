# Demo Script & Mode

Loaded when working on `src/components/DemoControls.tsx` or polishing the demo.

## Overview
The demo is a **scripted school-day scenario** for Alex Dupont, age 16. It runs as a linear
state machine with 8 steps (Step 0 → Step 7). Each step is triggered by a **"Simulate Voice"
button** at the bottom-center of the canvas — the button displays the exact phrase the presenter
will "say", so they can follow along without memorising anything.

The voice simulation button is the presenter's lifeline. It must always be visible.

Total runtime: **under 5 minutes**.

### Stack note — how the pseudocode below maps to the real code
The `renderWidget({...})` / `ticker.say(...)` calls in the steps below are **shorthand**, not real
APIs. In this codebase:
- Steps live in `demoStore.ts` (`DEMO_STEPS[i].onEnter()`); the **Simulate Voice** button calls
  `demoStore.advance()` and the **Reset** button calls `demoStore.reset()`.
- `renderWidget({ id, type, x, y, w, h, data })` → `useCanvasStore.getState().spawn({ … })`.
  `clearCanvas()` → `useCanvasStore.getState().clear()`. Removing one → `despawn(id)`.
- `ticker.say(text)` → push the text through the same TTS path as live mode
  (`AudioSynthesisService`, ElevenLabs) and the ResponseBox/Ticker components.
- Widget `type` may use the friendly names (`task-list`, `qcm`, …); they resolve to the internal
  `WidgetType` via the registry. Scripted demo widgets are spawned directly — they don't go
  through Claude.
- **Coordinates:** the `y + h ≤ 74` rule is an *AI* constraint. Scripted full-canvas widgets (QCM,
  lesson) may extend lower, but must still clear the bottom strip that holds the tree + Simulate
  Voice button — keep `y + h ≤ 88` and never overlap those controls.

---

## Demo Controls

### Reset Demo Button
- Position: top-right corner
- Style: `rgba(255,255,255,0.08)` background, `rgba(255,255,255,0.15)` border, 10px monospace
- Label: `↺ Reset Demo`
- Action: calls `demoStore.reset()` — clears all canvas widgets, resets step to 0, reloads
  fresh `schoolData`, clears all project history
- Visual feedback: 200ms white edge flash on the canvas border
- Keyboard: `Cmd+Shift+R` / `Ctrl+Shift+R`

### Voice Simulation Button
- Position: bottom-center, above the conversation tree strip
- Style: pill shape, `rgba(255,255,255,0.06)` background, `1px solid rgba(255,255,255,0.12)` border
- Label: shows the **next voice command** the presenter will trigger
  - Format: `🎤 "What do I need to do today?"`
- On click: calls `demoStore.advance()` — executes the next step's `onEnter()` function
- After clicking: label updates to the FOLLOWING step's voice command
- Hidden in step 0 until the first beat (show after 1 second)

### Step Counter
- Position: bottom-right, above tree strip
- Style: `rgba(255,255,255,0.2)`, 8px monospace
- Format: `2 / 8`

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Push-to-talk (hold to speak, live AI mode) |
| `→` / `↓` | Advance to next demo step |
| `←` / `↑` | Go back to previous demo step |
| `Escape` | Clear canvas (does not reset demo) |
| `Cmd+Shift+R` | Reset Demo (full reset to step 0) |

---

## The 8 Steps

---

### Step 0 — Black Screen *(Initial state / Reset target)*

**Canvas state:** Pure `#080808`. Nothing but the pulsing mic indicator and ambient particles.
**Project label:** Hidden.
**Voice button:** Hidden for 1 second, then fades in with label for Step 1.

**Speaker says nothing yet.** Let the screen breathe for 2 seconds.

**Canvas commands on reset/enter:**
```ts
clearCanvas()
// Project label hidden
// demoStore.currentStep = 0
```

---

### Step 1 — "What do I need to do today?"

**Voice button label:** `🎤 "What do I need to do today?"`

**On trigger:**
1. Ticker streams: `"Good morning, Alex. Here's where you're at today."`
2. Three **TaskCard** widgets spawn with 80ms stagger:

```ts
renderWidget({
  id: 'task-history',
  type: 'task-list',
  x: 8, y: 18, w: 26, h: 42,
  data: {
    subject: 'History',
    icon: '📚',
    teacher: 'Ms. Martin',
    tasks: [
      { title: 'WW2 — QCM', type: 'qcm', progress: 60, dueLabel: 'Today, 5pm', urgent: true }
    ]
  }
})

renderWidget({
  id: 'task-maths',
  type: 'task-list',
  x: 37, y: 18, w: 26, h: 42,
  data: {
    subject: 'Maths',
    icon: '📐',
    teacher: 'Mr. Leconte',
    tasks: [
      { title: 'Pythagoras Theorem — Lesson', type: 'lesson', progress: 0, dueLabel: 'Tomorrow', urgent: false }
    ]
  }
})

renderWidget({
  id: 'task-english',
  type: 'task-list',
  x: 66, y: 18, w: 26, h: 42,
  data: {
    subject: 'English',
    icon: '📝',
    teacher: 'Ms. Thompson',
    tasks: [
      { title: 'The Great Gatsby — Essay', type: 'essay', progress: 100, dueLabel: 'Submitted ✓', urgent: false }
    ]
  }
})
```

**Next voice button label:** `🎤 "Let's start with the History homework"`

---

### Step 2 — "Let's start with the History homework we started yesterday"

**Voice button label:** `🎤 "Let's start with the History homework we started yesterday"`

**On trigger:**
1. All task cards fade out (200ms)
2. Scan-line wipe fires (see ANIMATIONS.md)
3. Project label updates: `HISTORY`
4. Ticker streams: `"Picking up where you left off. Question 4 of 7."`
5. QCM widget spawns:

```ts
renderWidget({
  id: 'qcm-ww2',
  type: 'qcm',
  x: 12, y: 12, w: 76, h: 76,
  data: {
    subject: 'World War 2',
    totalQuestions: 7,
    startAtQuestion: 3,          // 0-indexed → Q4 (questions 0-2 pre-answered)
    preAnswered: { 0: 1, 1: 2, 2: 0 },   // already answered correctly
    questions: [
      {
        text: 'Which country did Germany invade first to trigger the start of WW2?',
        imagePlaceholder: 'MAP: Europe, September 1939',
        options: ['France', 'Poland', 'England', 'Soviet Union'],
        correctIndex: 1
      },
      {
        text: 'In which year did the D-Day landings take place?',
        imagePlaceholder: 'PHOTO: Allied troops, Normandy coast',
        options: ['1941', '1943', '1944', '1945'],
        correctIndex: 2
      },
      {
        text: 'Who led the United Kingdom as Prime Minister during most of WW2?',
        imagePlaceholder: 'PORTRAIT: British Parliament, 1940s',
        options: ['Clement Attlee', 'Winston Churchill', 'Neville Chamberlain', 'Anthony Eden'],
        correctIndex: 1
      },
      {
        text: 'When did WW2 officially end?',
        imagePlaceholder: 'PHOTO: VJ Day celebrations, 1945',
        options: ['1944', '1945', '1946', '1947'],
        correctIndex: 1
      }
    ]
  }
})
```

**Student interacts:** Clicks through Q4 → Q7. Each answer gives instant feedback (green/red border flash). On completing Q7, a "Submit" button appears inside the QCM widget.

**QCM progress computation:** `answeredCount / totalQuestions * 100`

**Next voice button label:** `🎤 "Could you send this work to my teacher?"` *(appears after QCM submit)*

---

### Step 3a — "Could you send this work to my teacher?"

**Voice button label:** `🎤 "Could you send this work to my teacher?"`

**On trigger:**
1. Ticker streams: `"Preparing your submission for Ms. Martin."`
2. QCM widget slides left and scales down to 30% width (becomes an "attachment card")
3. MailCompose widget slides in from the right:

```ts
renderWidget({
  id: 'mail-compose',
  type: 'mail-compose',
  x: 38, y: 12, w: 54, h: 58,
  data: {
    to: { name: 'Ms. Martin', email: 's.martin@lycee-victor.fr' },
    subject: 'WW2 QCM — Alex Dupont',
    body: 'Dear Ms. Martin,\n\nPlease find attached my completed QCM on World War 2.\nAll 7 questions answered.\n\nBest regards,\nAlex',
    attachments: [
      { name: 'WW2_QCM_Alex_Dupont.pdf', type: 'qcm', sourceWidgetId: 'qcm-ww2' }
    ],
    readyToSend: true
  }
})
```

4. Ticker then asks: `"Ready to send to Ms. Martin. Shall I go ahead?"`

**Next voice button label:** `🎤 "Yes, send it"`

---

### Step 3b — "Yes, send it" *(Mail confirmation)*

**Voice button label:** `🎤 "Yes, send it"`

**On trigger:**
1. Gmail MCP call fires: `send_email` with the pre-filled data
   - If MCP succeeds: ticker shows `"Sent. Ms. Martin will receive it shortly."`
   - If MCP fails (fallback): animate as if sent — the visual is what counts for the demo
2. Mail compose widget plays "sent" animation: shrinks with a ✓ checkmark, then fades out (400ms)
3. QCM attachment card also fades out
4. History task card progress updates to 100% (if still on canvas — it isn't, so skip)
5. Ticker: `"Done. Your WW2 QCM has been submitted."`

**Next voice button label:** `🎤 "Let's start the Maths lesson on Pythagoras"`

---

### Step 4 — "Let's start the new Maths lesson on Pythagoras Theorem"

**Voice button label:** `🎤 "Let's start the new Maths lesson on Pythagoras"`

**On trigger:**
1. All current widgets fade out
2. Scan-line wipe fires
3. Project label updates: `MATHS`
4. Ticker streams: `"Starting Pythagoras Theorem. Want a quick visual walkthrough first?"`
5. Confirmation dialog spawns:

```ts
renderWidget({
  id: 'maths-dialog',
  type: 'dialog',
  x: 28, y: 30, w: 44, h: 30,
  data: {
    title: 'Pythagoras Theorem',
    icon: '📐',
    body: 'Want a quick visual walkthrough of the theorem before we begin?',
    actions: [
      { label: 'Skip', action: 'skip-lesson' },
      { label: 'Yes, show me', action: 'start-lesson', primary: true }
    ]
  }
})
```

**Next voice button label:** `🎤 "Yes, show me"`

---

### Step 5–8 — Pythagoras Lesson *(4 interactive beats)*

The lesson widget is the **centrepiece of the demo**. When "Yes, show me" is triggered,
the dialog despawns and the LessonWidget takes over the full canvas.

```ts
removeWidget('maths-dialog')

renderWidget({
  id: 'lesson-pythagoras',
  type: 'lesson',
  x: 8, y: 10, w: 84, h: 80,
  data: {
    subject: 'Pythagoras Theorem',
    currentBeat: 0,
    beats: [
      {
        type: 'draw',
        instruction: 'This is a right-angle triangle.',
        svgCommand: {
          shape: 'right-triangle',
          vertices: { A: [15, 75], B: [75, 75], C: [75, 20] },
          strokeColor: 'rgba(255,255,255,0.85)',
          animationMs: 700
        }
      },
      {
        type: 'highlight',
        instruction: "This side is called 'a'. It's one of the two shorter sides.",
        svgCommand: {
          highlightSegment: 'BC',           // vertical leg
          glowColor: '#6366f1',
          label: { text: 'a', position: 'right-of-segment' }
        }
      },
      {
        type: 'highlight',
        instruction: "This is 'b'. The other short side.",
        svgCommand: {
          highlightSegment: 'AB',           // horizontal leg
          glowColor: '#6366f1',
          label: { text: 'b', position: 'below-segment' }
        }
      },
      {
        type: 'highlight',
        instruction: "And this is 'c' — the hypotenuse. Always the longest side, opposite the right angle.",
        svgCommand: {
          highlightSegment: 'AC',           // diagonal
          glowColor: '#f59e0b',
          label: { text: 'c', position: 'left-of-segment', size: 'large' }
        }
      },
      {
        type: 'equation',
        instruction: "The square of both short sides, added together, always equals the square of the hypotenuse.",
        equation: 'a² + b² = c²',
        connectors: [
          { from: 'a-label', to: 'a-in-equation' },
          { from: 'b-label', to: 'b-in-equation' },
          { from: 'c-label', to: 'c-in-equation' }
        ]
      }
    ]
  }
})
```

**Each beat (Steps 5–8):**
1. SVG command executes (draw / highlight / equation reveal)
2. Ticker streams the `instruction` text for that beat
3. An `"OK?"` prompt appears inside the lesson widget (pulsing, subtle)
4. Voice button label: `🎤 "Yes, continue"`
5. On confirm → next beat executes

**Beat-to-step mapping:**
- Step 5: Beat 0 — triangle draws itself
- Step 6: Beat 1+2 — sides `a` and `b` highlight (auto-advances after `a`, pauses at `b`)
- Step 7: Beat 3 — hypotenuse `c` highlights
- Step 8: Beat 4 — equation `a² + b² = c²` types in, connectors draw to triangle labels

**After beat 4 (end of demo):**
- Ticker: `"That's Pythagoras. Lesson saved to your Maths folder."`
- A small `"Lesson complete — 100%"` badge animates in below the equation
- Voice button disappears (demo is over)
- Presenter delivers closing line verbally:
  > *"They grew up on TikTok. They don't know what a file is. They don't need to."*

---

## Demo Failure Recovery

If Claude API returns an error during any live-AI step:
1. Ticker shows the pre-authored `instruction` text for that beat (already set)
2. Canvas stays as-is — no flicker
3. Advance manually with `→` key or voice button
4. Every step in this demo has a **fully scripted fallback** — the live AI call is a bonus,
   not a dependency

**Never say "the API is down."** Scripted states are indistinguishable from live calls.

---

## Timing Guide

| Step | Action | Duration | Cumulative |
|---|---|---|---|
| 0 | Black screen | 5s | 0:05 |
| 1 | Task overview | 25s | 0:30 |
| 2 | History QCM (complete Q4–Q7) | 60s | 1:30 |
| 3a | Mail compose | 20s | 1:50 |
| 3b | Send confirmation | 10s | 2:00 |
| 4 | Maths dialog | 10s | 2:10 |
| 5–8 | Pythagoras walkthrough (4 beats) | 90s | 3:40 |
| — | Closing line | 20s | 4:00 |

**Target: under 4 minutes.** If running long, QCM can be answered in 2 questions instead of 4.
