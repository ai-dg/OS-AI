# OS-AI — AI-Native OS Interface

**Anthropic × Y Combinator Hackathon | 42AI | 24h build**

## What We Are Building
A full-screen black canvas where AI assembles the UI in real time around a user's voice. No windows, no apps, no switching — one screen, one agent, infinite context. Think JARVIS from Iron Man.

This is a **demo**, not a product. Every decision optimises for judge impact in a 5-minute presentation.

**Demo scenario:** Alex Dupont, 16 years old, starts their school day. JARVIS knows their classes, their homework progress, and their teachers. The demo proves the product is real by doing three things a normal OS cannot: it knows your context, it renders adaptive UI for every task type, and it executes on your behalf (sending a real email via Gmail MCP).

## Critical Commands
```bash
npm run dev          # Vite dev server on localhost:5173
npm run build        # tsc -b && vite build → dist/
npm run preview      # Preview prod build locally
npm run typecheck    # tsc -b --noEmit
```

## Tech Stack (authoritative — match this exactly when building new features)
- **Framework:** React 18 + Vite 7 + TypeScript (strict). Path alias `@/` → `src/`.
- **Styling:** **Tailwind CSS v4** via `@tailwindcss/vite` (`@import "tailwindcss"` in `index.css`). Utility classes are the default; use inline `style={{…}}` only for **dynamic** values (computed %, colours from data). No CSS Modules, no styled-components. The aesthetic is cyber-minimalist / ASCII-terminal: `font-mono` everywhere, the **zinc** palette, solid dark fills, sharp 1px borders.
- **Animation:** **Framer Motion v11** (`motion.*`, `initial`/`animate`/`transition`) for widget spawn, stagger, and bar fills. Camera transitions (pan, zoom, pan-zoom) are **plain CSS transitions** on the canvas wrapper div — NOT Framer Motion. Plain CSS transitions are fine for trivial hovers. Keep it subtle.
- **AI:** Anthropic via **Vercel AI SDK v5** (`ai` + `@ai-sdk/anthropic`). Browser-side provider (`createAnthropic`, `anthropic-dangerous-direct-browser-access` header) — the key ships to the client, acceptable for a local demo only. Model: **`claude-sonnet-4-6`**.
- **AI contract:** Claude returns **one streamed JSON object** (`{ speech, canvas }`) — see Architecture below. This is **NOT** AI-SDK tool calling. `converse.ts` parses the JSON and mutates the canvas store directly.
- **MCP:** Gmail via the `mcp_servers` param on a raw Anthropic Messages API call (`src/ai/gmailMCP.ts`, beta header `mcp-client-2025-04-04`). A mock path spawns hardcoded emails when no OAuth/key is present.
- **Voice:**
  - **TTS** — `src/voice/AudioSynthesisService.ts`: **ElevenLabs** (`@elevenlabs/elevenlabs-js`, `eleven_flash_v2_5`, voice "George") with native `speechSynthesis` fallback. Sentence queue, pipelined synthesis, returns a `{ play, durationMs }` handle so text reveal paces to the audio.
  - **STT** — push-to-talk. `useWhisper.ts` (transformers.js `whisper-tiny.en` in a Web Worker) is the robust path; `useSpeech.ts` (Web Speech API) is the lightweight alternative.
- **State:** **Zustand** — `canvasStore`, `treeStore`, `projectStore` (+ `demoStore` for the scripted school demo). No Redux.
- **Persistence:** localStorage for project state snapshots (key prefix `jarvis_project_`).

## Project Structure
```
src/
  App.tsx                  # Orchestrator: voice → AI → canvas → tree
  main.tsx
  index.css                # @import "tailwindcss" + .canvas-bg dot grid
  canvas/
    Canvas.tsx             # Full-screen black canvas, camera/zoom transform, arrow overlay
    WidgetCanvas.tsx       # Maps the widget store to positioned renderers
    layoutManager.ts       # clampToSafeZone() + layout helpers + spatial canvas utils (resolveRegion, computeMinZoom)
  widgets/
    types.ts               # Widget interface + the WidgetType union
    registry.tsx           # WIDGETS map: WidgetType → render fn (inline or imported component)
    dynamicSchema.ts       # Zod schema for the dict-based dynamic canvas format
    DynamicWidgetFactory.tsx
    EmailWidget.tsx
    ImageWidget.tsx
    # NEW (school demo) — each a component imported into registry.tsx:
    TaskList.tsx           # homework overview card (see WIDGETS.md)
    QCMWidget.tsx          # multiple-choice quiz (see WIDGETS.md)
    LessonWidget.tsx       # interactive lesson / SVG drawing (see WIDGETS.md)
    MailCompose.tsx        # compose + attach + send (see WIDGETS.md)
    Dialog.tsx             # yes/no prompt (see WIDGETS.md)
  ai/
    client.ts              # Browser-side Anthropic provider + MODEL constant
    converse.ts            # streamText loop, JSON parse, speech/canvas sync playback
    orchestrate.ts         # dispatch helpers for the legacy `widgets` + dynamic dict formats
    systemPrompt.ts        # JARVIS persona + widget catalog + project context injection
    gmailMCP.ts            # Gmail MCP server config + mock inbox
    intentRouter.ts        # Agent 1 — utterance → { feature, params } | free-form (fast Haiku)
    progressTracker.ts     # Agent 2 — activation event → mark demo-step IDs complete (async)
    lessonTutor.ts         # Lesson Tutor — in-lesson student input → reframe / deepen the same idea
  voice/
    AudioSynthesisService.ts  # ElevenLabs TTS (+ native fallback)
    useWhisper.ts / whisperWorker.ts  # Whisper STT in a worker
    useSpeech.ts           # Web Speech API STT (alt)
    speech.d.ts
  components/
    Ticker.tsx             # Ephemeral spoken-sentence display
    ResponseBox.tsx        # Live streamed answer text
    ChatBox.tsx
    JarvisOrb.tsx          # Mic indicator / status orb
    ProjectLabel.tsx       # Top-left project name label
    # NEW: DemoControls.tsx — Reset Demo button + Simulate-Voice (guided-fallback) button
  projects/
    projectStore.ts        # Project folder state — switch, save, restore (useProjectStore)
    # NEW: schoolData.ts   — pre-seeded demo data (Alex, teachers, homework)
  tree/
    ConversationTree.tsx   # SVG node graph at bottom of canvas
  store/
    canvasStore.ts         # Zustand canvas widget state + camera
    treeStore.ts           # Zustand conversation tree state
    # NEW: demoStore.ts    — feature registry + Tracker-owned completion set (order-independent)
.claude/
  docs/                    # Deep-dive specs (this folder)
  commands/                # Claude Code slash commands
```

## Architecture — Read This First
The app is driven by a **single JSON contract** between Claude and the canvas — **not** tool calling.

`converse.ts` calls `streamText(...)`, streams the response, pulls the `speech` field out live for the ticker, then `JSON.parse`s the full buffer. Claude's primary format:

```json
{
  "speech": "Let me move to a new view.|Here is the first concept.|And the second.",
  "canvas": [
    { "action": "pan-zoom", "region": "right", "scale": 1.0 },
    { "action": "spawn", "type": "text-block", "id": "ctx", "x": 112, "y": 10, "w": 40, "h": 30, "data": { "title": "…", "body": "…" } },
    { "action": "zoom",  "targetId": "ctx", "scale": 1.4 }
  ]
}
```

- `speech` is **first** and uses `|` to mark segment boundaries. **One segment per canvas action**, played in lock-step: segment *i* is spoken (paced to its ElevenLabs clip duration) while `canvas[i]` paints. This keeps voice and UI in sync with no gaps.
- `canvas[0]` is **always an orientation action** — either `despawn "*"` (clearing) or `pan-zoom` (moving to a district). Never a bare `spawn`.
- `x, y, w, h` are **canvas units** (plain numbers, no `%`). Within origin region (0–100), identical to the old viewport-% system. Beyond 100, they address off-screen districts. See SPATIAL_CANVAS.md.
- Two **secondary** formats also exist and are auto-detected in `converse.ts`: a legacy declarative `widgets` array and a dict-based **dynamic** format (Zod-validated in `dynamicSchema.ts`, dispatched by `orchestrate.ts`).

### Spatial Canvas
The canvas is a **virtual 300×300 unit space**. The viewport is a camera flying over it. The AI builds new "districts" as conversation grows (`origin`, `right`, `far-right`, `below`, `below-right`); the user can freely navigate when the AI is idle (drag to pan, scroll to zoom). `Cmd+0` fits all content in view. During AI speech, the camera is locked (`isAISpeaking: true`). See `.claude/docs/SPATIAL_CANVAS.md`.
- **Scripted demo runs on two independent agents** (intent-driven, not linear). The main loop (`App.tsx → handleUtterance`) calls both: **Agent 1 — Intent Router** (`src/ai/intentRouter.ts`, fast Haiku, structured `{ feature, params }` decision) classifies every utterance to a *feature* (`todo-overview`, `qcm`, `lesson`, `mail-compose`, `project-switch`, `free-form`); a feature → `demoStore.activateFeature(...)` spawns pre-authored widgets directly via `useCanvasStore.getState().spawn(...)` (no Claude) in **any order**; `free-form` → live `converse`. **Agent 2 — Demo Progress Tracker** (`src/ai/progressTracker.ts`, async, never awaited) observes each activation event and marks *demo-step* IDs (`overview`, `history-qcm`, `send-homework`, `maths-lesson`) complete in `demoStore.completed`. The two agents never call each other. The Simulate-Voice button bypasses the Router, calling `activateFeature` directly for the next uncompleted step; the Tracker still runs. See `.claude/docs/DEMO_SCRIPT.md`.

Widget type names: Claude emits friendly names (`text-block`, `bullet-list`, `stat-card`, `code-block`); `converse.ts`/`orchestrate.ts` map them to internal `WidgetType` values (`card`, `bullets`, `stat`, `code`) before spawning.

## State Shape
```ts
// store/canvasStore.ts (Zustand)
{
  widgets: Record<string, Widget>,
  order: string[],                  // render order, last = top
  // Camera
  cameraOffsetX: number,            // canvas units, default 0
  cameraOffsetY: number,            // canvas units, default 0
  cameraZoomScale: number,          // default 1.0
  cameraMode: "idle" | "zoom" | "spotlight",
  cameraTargetId: string | null,
  minZoomScale: number,             // computed from widget bounding box
  isAISpeaking: boolean,            // LOCK FLAG — blocks user camera input during speech
  // Actions
  // spawn / despawn / clear / zoomCamera / spotlightCamera / resetCamera / snapshot / restore
  // panZoom / panCamera / fitAll (spatial canvas — NEW)
}

// store/demoStore.ts (two-agent model — feature registry + Tracker-owned progress)
{
  features: Record<string, FeatureDef>,   // feature → onActivate(params) (todo-overview, qcm, …)
  completed: Set<string>,                 // demo-step IDs marked by the Progress Tracker
  guidedLabel: string | null,             // next uncompleted step's phrase (fallback button)
  isComplete: boolean,                    // all demo steps complete
  progress: () => number,                 // completed / total
  activateFeature: (feature, params) => void,  // shared entry (Router path + scripted button)
  advanceGuided: () => void,              // Simulate-Voice → activateFeature for next uncompleted step
  markCompleted: (stepIds: string[]) => void,  // called by the Tracker only
  reset: () => void,                      // clear completion set + canvas + fresh schoolData
  // widget lifecycle → emit activation events the Tracker observes (NOT direct completion):
  onQCMComplete: (answers: Record<number, number>) => void,  // emits { qcm, submitted }
  onMailSent: () => void,                                     // emits { mail-compose, sent }
  handleDialogAction: (action: string) => void,              // lesson start/skip (widget-internal)
}

// projects/projectStore.ts (useProjectStore)
{
  activeProjectId: 'history' | 'maths' | 'english',
  projects: Record<string, SchoolProject>,
  getActiveContext: () => string,   // injected into the system prompt
  setActiveProject: (id) => void,
  reset: () => void,
}
```

## New Data Types (School Demo)
Defined in `src/projects/schoolData.ts`. See PROJECTS.md / SCHOOL_DATA.md for the full seed.

```ts
interface Teacher { name: string; email: string; subject: string }
type HomeworkType = 'qcm' | 'lesson' | 'essay'
interface Homework { id: string; type: HomeworkType; title: string; dueDate: string; dueLabel: string; data: QCMData | LessonData | EssayData }
interface QCMData { subject: string; questions: QCMQuestion[]; answers: Record<number, number> }
type ExplanationApproach = 'visual' | 'analogy' | 'example' | 'formal'
interface LessonConcept { concept: string; introApproach: ExplanationApproach; visual: { type: 'draw'|'highlight'|'equation'|'none'; svgCommand?: Record<string, unknown>; equation?: string }; explanations: { approach: ExplanationApproach; instruction: string }[] }
interface LessonData { subject: string; concepts: LessonConcept[]; activeConceptId: string; confirmedConceptIds: string[] }  // concept LIBRARY, not a beat sequence
interface EssayData { subject: string; submitted: boolean; submittedAt?: string }
interface SchoolProject { id: string; name: string; teacher: Teacher; homeworks: Homework[]; history: ModelMessage[]; canvasState: Widget[]; tree: unknown[]; activeNodeId: string | null }
```

## Non-Negotiable Rules
1. **Never break the demo loop.** If Claude returns malformed JSON, `converse.ts` already falls back to a `text-block` widget with the raw text — never a blank screen or error. Preserve that.
2. **Black only.** Background is `#080808` (set in `index.css`). No white backgrounds. Widget cards use solid dark zinc fills with 1px `zinc-800`/low-alpha-white borders.
3. **Canvas units, not px.** All widget `x/y/w/h` are canvas units (0–300 range), plain numbers. Within the origin region (0–100) they are identical to the old viewport-% system. **`y + h ≤ 74` per 100-unit band** — bottom 26 units reserved per region. See SPATIAL_CANVAS.md for named regions and off-screen coordinates.
4. **One font.** `font-mono` (`'JetBrains Mono', 'Fira Code', monospace`) everywhere. Scale: 10px labels, ~13px body (`text-xs`), 24px headings, 48px stat numbers.
5. **Animation via Framer Motion**, kept short (~200–400ms, ease-out). Project-switch wipe is the scan-line described in ANIMATIONS.md.
6. **No visible browser chrome.** `overflow: hidden` on body. No scrollbars on the canvas. No outlines.
7. **localStorage key prefix:** `jarvis_project_` — never read/write other keys.
8. **Reset Demo must be perfect.** `demoStore.reset()` clears the completion set, the canvas (`canvasStore.clear()`), and reloads fresh `schoolData` — guided cursor back to the first intent. Camera resets to origin (0,0) at scale 1.0 with `isAISpeaking: false`. No artifacts, no stale widgets.
9. **Progress is computed, not stored raw.** QCM = answered/total; lesson = confirmedConcepts/totalConcepts (comprehension-driven, not position) / currentBeat/totalBeats; essay = binary. See `computeProgress()` in `schoolData.ts`.
10. **Add a widget the existing way.** New type → add to the `WidgetType` union in `widgets/types.ts`, add a renderer in `widgets/registry.tsx` (inline fn, or a component file imported in like `EmailWidget`/`ImageWidget`), and add a catalog entry to `ai/systemPrompt.ts` if Claude should be able to spawn it.

## Key Files to Know
| File | What it does |
|---|---|
| `src/ai/converse.ts` | streamText loop, JSON parse, speech↔canvas sync playback, fallback |
| `src/ai/client.ts` | Browser-side Anthropic provider + `MODEL` |
| `src/ai/orchestrate.ts` | Dispatch for legacy `widgets` + dynamic dict formats; type-name mapping |
| `src/ai/systemPrompt.ts` | JARVIS persona + widget catalog + project context injection |
| `src/ai/gmailMCP.ts` | Gmail MCP server config (+ mock inbox) |
| `src/widgets/registry.tsx` | `WIDGETS` map — every renderer (Tailwind + Framer Motion) |
| `src/store/canvasStore.ts` | Canvas widget + camera state incl. spatial canvas fields (`cameraOffsetX/Y`, `isAISpeaking`, `minZoomScale`) |
| `src/projects/projectStore.ts` | Project switch / save / restore (`useProjectStore`) |
| `src/projects/schoolData.ts` | Pre-seeded demo data — Alex, teachers, QCM, lesson beats |
| `src/store/demoStore.ts` | Feature registry + Tracker-owned progress — `activateFeature()`, `advanceGuided()`, `markCompleted()`, `reset()` |
| `src/ai/intentRouter.ts` | **Agent 1** — routes an utterance to a feature + params (fast Haiku, structured decision) |
| `src/ai/progressTracker.ts` | **Agent 2** — observes activation events, marks demo-step IDs complete (async) |
| `src/ai/lessonTutor.ts` | **Lesson Tutor** — every in-lesson turn → one of 4 responses (deepen / reframe / advance / clarify; a vague "ok" is clarified, never auto-advanced); maintains the session `comprehension` state (concepts + status + approaches used + sub-questions), reset on topic switch |
| `src/voice/AudioSynthesisService.ts` | ElevenLabs TTS (+ native fallback), audio-paced playback |

## See Also
- `.claude/docs/SPATIAL_CANVAS.md` — **canonical spec** for the virtual canvas coordinate system, named regions, camera actions, and lock behaviour *(NEW)*
- `.claude/docs/WIDGETS.md` — widget specs incl. new QCM, Lesson, TaskList, MailCompose, Dialog
- `.claude/docs/AI_CONTRACT.md` — the JSON contract, `converse.ts` pipeline, new camera actions, Gmail MCP
- `.claude/docs/PROJECTS.md` — school project folder system, switch animation spec
- `.claude/docs/DEMO_SCRIPT.md` — intent-driven demo: routing, the 4 demo intents, guided fallback
- `.claude/docs/ANIMATIONS.md` — every transition spec incl. camera move timings *(updated)*
- `.claude/docs/SCHOOL_DATA.md` — full pre-seeded data reference for Alex's school day
- `.claude/docs/BUILD_PLAN.md` — implementation order for the school demo

## Committing
When making commits, follow `.claude/commit-policy.md` — Conventional Commits format, no co-author lines, ask before committing autonomously.

## Setup
```bash
npm install
printf 'VITE_ANTHROPIC_API_KEY=sk-ant-...\nVITE_ELEVENLABS_API_KEY=...\n' > .env.local
npm run dev   # → http://localhost:5173
```
Use **Chrome or Edge** — the demo relies on Web Audio + (optionally) the Web Speech API.

This project uses the [ECC plugin](https://github.com/affaan-m/ECC) for Claude Code:
```bash
/plugin install ecc@ecc
/reload-plugins
```

## Key Commands
- `/ecc:cost-tracking` — view token usage and spend for this project
- `/code-review` — review current diff for bugs and improvements
- `/plan` — plan a feature before implementing
- `/ecc:save-session` — save session context before compacting
