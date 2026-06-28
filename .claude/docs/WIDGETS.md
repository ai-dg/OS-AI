# Widget System Spec

Loaded when working in `src/widgets/`.

## Overview
All widgets are absolutely positioned on the black canvas using `%` units (`y + h ≤ 74` — bottom 26% is system UI). They are rendered by `registry.tsx`'s `WIDGETS` map keyed on the internal `widget.type`. Styling is **Tailwind v4** utilities (zinc palette, `font-mono`) + inline `style` for dynamic values; animation is **Framer Motion**. Every widget shares the same lifecycle: **spawn → idle → despawn**. The `rgba(...)`/px values in the per-widget specs below are the design intent — express them as Tailwind classes where one exists, inline `style` otherwise.

### Shared Widget Interface
```ts
interface Widget {
  id: string          // unique, used by zoom/despawn/highlight commands
  type: WidgetType
  x: number           // % from left edge of canvas
  y: number           // % from top edge of canvas
  w: number           // % of canvas width
  h: number           // % of canvas height
  data: object        // type-specific payload (see below)
}
```

### Spawn Animation (ALL widgets)
```css
opacity: 0 → 1 over 300ms ease-out
transform: scale(0.95) → scale(1) over 300ms ease-out
```

### Despawn Animation (ALL widgets)
```css
opacity: 1 → 0 over 200ms ease-in
transform: scale(1) → scale(0.95) over 200ms ease-in
/* Remove from DOM after animation completes */
```

---

## Existing Widget Types

### `text-block`
General purpose text card.
```ts
data: {
  title?: string,
  body: string,           // supports \n for line breaks
  accent?: string,        // optional left border color e.g. '#6366f1'
}
```
Render: dark card, title in 14px semibold, body in 13px regular, 1px left border if accent set.

---

### `bullet-list`
Items animate in one-by-one with 150ms stagger.
```ts
data: {
  title?: string,
  items: string[],
  staggerMs?: number,     // default 150
}
```
Render: each bullet preceded by `›` in accent color. Items fade+slide in from left.

---

### `stat-card`
Big number with a label.
```ts
data: {
  value: string,          // e.g. "3", "94%", "$2.4M"
  label: string,
  trend?: string,         // e.g. "↑ 12% vs last week"
}
```
Render: value at 48px, label at 11px below, trend in green/red at 10px.

---

### `code-block`
Syntax-highlighted code snippet.
```ts
data: {
  language: string,
  code: string,
  filename?: string,
}
```
Render: monospace, `#0d0d0d` bg, basic keyword highlighting (purple, green, gray). No external lib.

---

### `arrow`
SVG line connecting two widgets.
```ts
data: {
  fromId: string,
  toId: string,
  label?: string,
  color?: string,         // default 'rgba(255,255,255,0.4)'
}
```
Render: SVG `<line>` between widget centers. Arrowhead at target. Animates via stroke-dashoffset.

---

### `highlight-overlay`
Colored wash over a canvas region.
```ts
data: {
  color: string,          // e.g. 'rgba(99,102,241,0.12)'
  label?: string,
}
```

---

### `progress-bar`
Animated fill bar.
```ts
data: {
  label: string,
  value: number,          // 0–100
  color?: string,         // default '#6366f1'
}
```
Render: 8px bar, fills from 0 to `value` over 1000ms ease-out on spawn.

---

### `image-placeholder`
Dashed box for unrealised images.
```ts
data: {
  label: string,
  icon?: string,
}
```

---

### `email-ui`
Email inbox widget. Two schemas:

**Multi-email (preferred):**
```ts
data: {
  emails: Array<{
    id: string,
    from: string,
    subject: string,
    preview: string,
    date: string,
    read: boolean,
    labels?: string[],
  }>,
  selectedId: string | null,
  unreadCount: number,
}
```

**Single-card (legacy / AI system prompt):**
```ts
data: {
  from: string,
  subject: string,
  preview: string,
  timestamp: string,
  unread: boolean,
}
```

---

## New Widget Types (School Demo)

---

### `task-list`
Subject overview card. Shows a class's pending homeworks with progress bars.
Used in Step 1 of the demo — three of these spawn to give the "today's tasks" view.

```ts
data: {
  subject: string,            // e.g. "History"
  icon: string,               // emoji e.g. "📚"
  teacher: string,            // e.g. "Ms. Martin"
  tasks: Array<{
    title: string,            // e.g. "WW2 — QCM"
    type: 'qcm' | 'lesson' | 'essay',
    progress: number,         // 0–100
    dueLabel: string,         // e.g. "Today, 5pm" or "Submitted ✓"
    urgent: boolean,          // if true, due label is shown in amber
  }>
}
```

**Render spec:**
- Card with `rgba(255,255,255,0.05)` background, `1px solid rgba(255,255,255,0.08)` border, 12px radius
- Top: subject name in 16px semibold + icon, teacher name in 10px muted below
- Horizontal divider
- For each task:
  - Task title in 13px
  - Type badge: `QCM` / `LESSON` / `ESSAY` — 10px pill, `rgba(255,255,255,0.08)` bg
  - Progress bar: 4px height, fills to `progress`%, accent purple `#6366f1`
    - 0% = empty bar, gray; 100% = full bar, green `#34d399`
  - Due label: 10px muted, amber `#f59e0b` if `urgent: true`
- No interaction — this is read-only overview

**Progress computation rules (for backend logic in `schoolData.ts`):**
```ts
function computeProgress(homework: Homework): number {
  if (homework.type === 'essay') {
    return homework.data.submitted ? 100 : 0
  }
  if (homework.type === 'qcm') {
    const answered = Object.keys(homework.data.answers).length
    return Math.round((answered / homework.data.questions.length) * 100)
  }
  if (homework.type === 'lesson') {
    return Math.round((homework.data.currentBeat / homework.data.beats.length) * 100)
  }
  return 0
}
```

---

### `qcm`
Interactive multiple-choice quiz widget. Fills most of the canvas.

```ts
data: {
  subject: string,
  totalQuestions: number,
  startAtQuestion: number,     // 0-indexed — start mid-quiz if partially complete
  preAnswered: Record<number, number>,  // questionIndex → chosenOptionIndex (already done)
  questions: Array<{
    text: string,
    imagePlaceholder?: string, // label for grey placeholder block e.g. "MAP: Europe 1939"
    options: string[],         // exactly 4 options
    correctIndex: number,
  }>
}
```

**Render spec:**
- Header bar: subject name left, `Q{current} of {total}` right, progress fill across top (purple)
- Image placeholder block: `rgba(255,255,255,0.03)` bg, dashed `rgba(255,255,255,0.1)` border,
  label centered in 10px muted, 20% of widget height. Hidden if no `imagePlaceholder`.
- Question text: 15px, `rgba(255,255,255,0.9)`, margin below image
- Answer options: 4 option rows, each:
  - `rgba(255,255,255,0.04)` bg, `1px solid rgba(255,255,255,0.07)` border, 8px radius
  - On hover: border brightens to `rgba(255,255,255,0.15)`
  - On select (before confirm): `rgba(99,102,241,0.15)` bg, `1px solid rgba(99,102,241,0.4)` border
  - On correct answer confirmed: `rgba(52,211,153,0.15)` bg, `1px solid #34d399` border, ✓ icon right
  - On wrong answer confirmed: `rgba(239,68,68,0.15)` bg, `1px solid #ef4444` border, ✗ icon right
  - Correct answer also highlights green even if student chose wrong
- Navigation: `[← Prev]` left, `[Next →]` right — monospace, 11px, ghost style
  - "Next" becomes "Submit" on final question
- Questions already in `preAnswered` are shown as correct and skipped on entry

**State (internal to component, not in canvasStore):**
```ts
{
  currentQuestionIndex: number,  // starts at startAtQuestion
  selectedAnswer: number | null, // current selection before confirming
  confirmedAnswers: Record<number, number>,  // merged from preAnswered on init
  submitted: boolean,            // true after final "Submit" click
}
```

**On submit:** call `demoStore.onQCMComplete(answers)` — this updates the homework's progress
in `schoolData` and triggers the voice button to show the next demo step.

---

### `lesson`
Interactive lesson widget. Drives the Pythagoras walkthrough. The AI "draws" on an SVG canvas
while narrating beat by beat, pausing at each segment for student confirmation.

```ts
data: {
  subject: string,
  currentBeat: number,         // which beat we are on (0-indexed)
  beats: LessonBeat[],
}

type LessonBeat =
  | DrawBeat
  | HighlightBeat
  | EquationBeat

interface DrawBeat {
  type: 'draw'
  instruction: string          // what ticker will say
  svgCommand: {
    shape: 'right-triangle' | 'rectangle' | 'circle' | 'line'
    vertices?: Record<string, [number, number]>  // named points, % of SVG canvas
    strokeColor: string
    fillColor?: string
    animationMs: number        // how long to draw
    rightAngleMarker?: string  // vertex name e.g. 'B'
  }
}

interface HighlightBeat {
  type: 'highlight'
  instruction: string
  svgCommand: {
    highlightSegment: string   // e.g. 'AB', 'BC' — refers to named vertices
    glowColor: string          // e.g. '#6366f1' for sides, '#f59e0b' for hypotenuse
    label?: {
      text: string             // e.g. 'a', 'b', 'c'
      position: 'right-of-segment' | 'below-segment' | 'left-of-segment' | 'above-segment'
      size?: 'normal' | 'large'
    }
  }
}

interface EquationBeat {
  type: 'equation'
  instruction: string
  equation: string             // e.g. 'a² + b² = c²'
  connectors?: Array<{
    from: string               // DOM id of label element in SVG
    to: string                 // DOM id of equation character span
  }>
}
```

**Render spec:**

Widget is split into two zones:
- **Left 65%:** SVG drawing canvas (black background, `rgba(255,255,255,0.02)` fill)
- **Right 35%:** Narration panel — current `instruction` text, then `"OK?"` prompt

**SVG drawing canvas:**
- Coordinate system: 0–100 in both x and y (mapped to actual SVG dimensions)
- All shapes drawn via animated `stroke-dashoffset` — line draws itself from start to end
- Named vertex markers: small white dots (3px radius) at each vertex, appear after segment draws
- Vertex labels: white, 12px monospace, offset from dot
- Highlight: targeted segment glows — change stroke to `glowColor`, add SVG `filter: blur(2px)`
  duplicate behind for glow effect
- Equation: appears below or beside the triangle — each character types in with 60ms delay
- Connector lines: thin dashed SVG lines from equation characters to corresponding triangle labels,
  drawn via stroke-dashoffset after equation is fully revealed

**Narration panel:**
- Top: current `instruction` text — streams in via ticker or inline (use inline to keep position stable)
- Bottom: `"OK?"` prompt — appears after instruction completes
  - Style: `rgba(255,255,255,0.15)` pill, pulsing opacity 0.6↔1.0, 1500ms cycle
  - On OK confirm: fires next beat, OK prompt disappears
- Final beat (equation): no OK prompt — lesson is complete, show "Lesson complete" badge

**Beat advancement:**
- Each beat is triggered by `demoStore.advance()` (voice button or `→` key)
- On advance: play the SVG animation for that beat, stream the instruction, show OK
- Progress saved back to `schoolData.maths.homeworks[0].data.currentBeat` after each beat

---

### `mail-compose`
Email compose widget for Step 3 of the demo. Pre-filled by the AI, confirmable by voice.

```ts
data: {
  to: { name: string, email: string },
  subject: string,
  body: string,               // pre-written by AI, newlines preserved
  attachments?: Array<{
    name: string,             // e.g. "WW2_QCM_Alex_Dupont.pdf"
    type: 'qcm' | 'lesson' | 'file',
    sourceWidgetId?: string,  // id of the widget being attached (for visual link)
  }>,
  readyToSend: boolean,       // if true, show "Send ✓" button prominently
}
```

**Render spec:**
- Card: slightly wider than typical — takes up right 55% of canvas in demo
- Header: `NEW MESSAGE` in 10px muted uppercase label
- To field: `To:` muted label, then `{name} <{email}>` in white — not editable in demo
- Subject field: `Subject:` muted label, then subject — not editable in demo
- Divider
- Body: pre-filled text, 13px, white, line breaks respected. Editable `<textarea>` for realism.
- Divider
- Attachments (if any):
  - Each attachment shows as a pill: `📎 {name}` — `rgba(255,255,255,0.06)` bg, 10px monospace
- Divider
- Actions row: `[Cancel]` ghost button left, `[Send ✓]` primary button right
  - `[Send ✓]` uses accent purple background when `readyToSend: true`

**Sent animation:**
1. On `[Send ✓]` click: button text becomes `Sending...`, spinner appears
2. After 800ms (or real MCP response): button becomes a `✓` checkmark, green
3. Widget plays despawn animation (shrinks toward ✓, then fades) over 600ms
4. Call `demoStore.onMailSent()` after animation completes

**Gmail MCP integration:**
```ts
// When Send is clicked, fire real Gmail MCP call via the AI client
// Tool: send_email (from Gmail MCP server)
// On success: play sent animation
// On failure: still play sent animation (demo must never fail visibly)
// The attachment is virtual — no real PDF is generated or attached
```

---

### `dialog`
Simple confirmation / choice widget. Used for the Maths lesson prompt in Step 4.

```ts
data: {
  title: string,
  icon?: string,              // emoji
  body: string,
  actions: Array<{
    label: string,
    action: string,           // internal action key — handled by demoStore
    primary?: boolean,        // if true, use accent button style
  }>
}
```

**Render spec:**
- Centered card, ~44% canvas width, ~30% height
- Icon + title row: icon at 24px, title at 16px semibold, same line
- Body: 13px, `rgba(255,255,255,0.7)`, margin below title
- Actions row: right-aligned, gap between buttons
  - Primary: `rgba(99,102,241,0.7)` background, white text
  - Non-primary: ghost style, `rgba(255,255,255,0.08)` bg on hover
- On action click: calls `demoStore.handleDialogAction(action)` then despawns itself

---

## Canvas Commands (unchanged)

```ts
{ action: 'zoom', targetId: string, scale: number }
{ action: 'zoom-out' }
{ action: 'spotlight', targetId: string }
{ action: 'despawn', id: string }
{ action: 'clear' }
{ action: 'switch-project', projectId: string }
```

---

## Registry & types (how widgets are actually wired)

The store keeps widgets in `widgets: Record<string, Widget>` + an `order: string[]` (last id on
top). `registry.tsx` exports a `WIDGETS: Record<WidgetType, Renderer>` map; each renderer is a
`(w: Widget) => JSX.Element` built with **Tailwind utility classes + Framer Motion** (see existing
`BulletsWidget`, `ProgressBarWidget`, `CircleStatWidget`). Simple widgets are inline renderers;
richer ones live in their own file and are imported (`DynamicWidgetFactory`, `EmailWidget`,
`ImageWidget`). The five new demo widgets follow the latter pattern.

**Friendly vs internal type names.** Claude (and this doc's data schemas) use friendly names like
`text-block`, `bullet-list`, `stat-card`, `code-block`. `converse.ts`/`orchestrate.ts` map those
to the **internal** `WidgetType` union in `types.ts`, whose members are `card`, `bullets`, `stat`,
`code`, `arrow`, `image`, `email`, `highlight-overlay`, `progress-bar`, `image-placeholder`,
`email-ui`, `network-graph`, `circle-stat`, `custom-card`, `data-grid`, `vector-graphics`,
`list-container`, `image-widget`. Specialised names that already match (e.g. `email-ui`,
`progress-bar`) pass through unchanged.

### To add a new widget (e.g. the demo widgets)
1. Create the component file: `TaskList.tsx`, `QCMWidget.tsx`, `LessonWidget.tsx`,
   `MailCompose.tsx`, `Dialog.tsx`.
2. Add its internal name to the `WidgetType` union in `types.ts`:
   ```ts
   // append to the existing union
   | 'task-list' | 'qcm' | 'lesson' | 'mail-compose' | 'dialog'   // NEW (school demo)
   ```
3. Register a renderer in `WIDGETS` in `registry.tsx` (import the component).
4. If the friendly name differs from the internal name, add a `TYPE_MAP`/`SYNC_TYPE_MAP` entry in
   `orchestrate.ts`/`converse.ts`.
5. If Claude should be able to spawn it live, add a catalog entry in `ai/systemPrompt.ts`. (Most
   demo widgets are spawned **only** by `demoStore` scripts, so this step is optional for them.)

### Rendering notes
- Lookups are O(1) via the `widgets` record; render in `order`.
- Despawn plays the exit animation (Framer Motion / `AnimatePresence`) before the id leaves the
  store.
- `arrow` widgets with `data.from` + `data.to` are drawn by the SVG overlay in `Canvas.tsx`, on
  top, and recompute centre points on resize.
- Stateful demo widgets (`qcm`, `lesson`) hold their own React state and call back into
  `demoStore` (`onQCMComplete`, beat advance) on completion.
