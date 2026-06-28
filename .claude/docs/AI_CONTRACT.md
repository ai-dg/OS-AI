# AI Contract — Claude JSON Contract & Pipeline

Loaded when working in `src/ai/`.

## Overview
The app does **NOT** use AI-SDK tool calling. Claude returns **one streamed JSON object**;
`converse.ts` parses it and mutates the Zustand `canvasStore` directly. The primary format is
`{ speech, canvas }` where each `|`-separated speech segment is spoken (paced to its TTS clip)
in lock-step with one canvas action, so voice and UI stay synchronised with no gaps.

Two secondary formats are auto-detected for backward compatibility: a declarative `widgets`
array and a dict-based **dynamic** format (Zod-validated). New work should target the primary
`{ speech, canvas }` format.

The school demo is **intent-driven, not linear** (see DEMO_SCRIPT.md), and runs on **two
independent agents** called by `App.tsx → handleUtterance` (full spec in *Two-Agent Architecture*
below):

```
1. Agent 1: Intent Router  routeIntent(text, ctx) → { feature, params } | { free-form }
2. feature   → demoStore.activateFeature(feature, params)  (spawns pre-authored widgets, no Claude)
   free-form → converse(history)                            (live Claude { speech, canvas })
3. Agent 2: Progress Tracker  trackActivation(event)  (async, after activation) → marks demo steps
```

Features (`todo-overview`, `qcm`, `lesson`, `mail-compose`, `project-switch`) are activated by
`demoStore`, which calls `useCanvasStore.getState().spawn(...)` directly with pre-authored data —
**no Claude call** — in **any order**. Only `free-form` input reaches `converse()`. The Router
*does* use Claude (a tiny Haiku routing call), but the scripted rendering never does.

---

## Client Config

```ts
// src/ai/client.ts
import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
export const hasApiKey = Boolean(apiKey);

// Browser-side provider. The dangerous-direct-browser-access header lets the API
// accept calls straight from the page — acceptable for a LOCAL DEMO ONLY, since
// the key ships to the client.
export const anthropic = createAnthropic({
  apiKey: apiKey ?? "missing-key",
  headers: { "anthropic-dangerous-direct-browser-access": "true" },
});

export const MODEL = "claude-sonnet-4-6";
```

---

## Conversation Pipeline

```ts
// src/ai/converse.ts (shape — see source for the full implementation)
import { streamText, type ModelMessage } from "ai";
import { anthropic, MODEL } from "./client";
import { buildSystemPrompt } from "./systemPrompt";
import { useProjectStore } from "@/projects/projectStore";

export async function converse(
  history: ModelMessage[],
  callbacks: ConverseCallbacks,
): Promise<ConverseResult> {
  const context = useProjectStore.getState().getActiveContext();

  // Lock camera before streaming begins
  useCanvasStore.getState().set({ isAISpeaking: true });

  const result = streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(context),
    messages: history,
    temperature: 0.7,
  });

  // 1. Stream tokens; extract the partial `speech` field live for the ResponseBox.
  // 2. Buffer the full text, then JSON.parse it.
  // 3. Route by shape:
  //      parsed.canvas (array)   → playSyncResponse()  — primary { speech, canvas } format
  //      dict `widgets`          → dispatchDynamicCanvas() (Zod-validated)
  //      array `widgets`         → dispatchWidgetDeclarations() (legacy)
  // 4. On malformed JSON → spawn a fallback `text-block` so the canvas is never blank.
  // 5. Always unlock camera in finally block.

  try {
    // ... streaming and sync playback ...
  } finally {
    useCanvasStore.getState().set({ isAISpeaking: false });
  }
}
```

### Callbacks (how text + audio stay in sync)
```ts
interface ConverseCallbacks {
  onSentence: (sentence: string) => void;        // one completed sentence → TTS (fallback path)
  onDelta?: (partial: string) => void;           // raw stream delta → live ticker
  onSpeechDelta?: (speechText: string) => void;  // extracted speech grows → ResponseBox
  // When provided, the sync path is AUDIO-DRIVEN: each segment's word-by-word text
  // reveal and its canvas action are paced to the clip's duration, and the next
  // segment is synthesized while the current plays (no gaps).
  synthesize?: (text: string) => Promise<{ play(): Promise<void>; durationMs: number }>;
}
```
`synthesize` is wired to `AudioSynthesisService` (ElevenLabs) in `App.tsx`. Without it,
`converse` falls back to a fixed-pace timed reveal + queue-based TTS.

---

## Primary format — `{ speech, canvas }`

```json
{
  "speech": "Let me move to a new view.|Here is the first concept.|And the second.|Zooming in.",
  "canvas": [
    { "action": "pan-zoom", "region": "right", "scale": 1.0 },
    { "action": "spawn", "type": "text-block", "id": "concept-1", "x": 112, "y": 10, "w": 40, "h": 30, "data": { "title": "…", "body": "…" } },
    { "action": "spawn", "type": "text-block", "id": "concept-2", "x": 158, "y": 10, "w": 40, "h": 30, "data": { "title": "…", "body": "…" } },
    { "action": "zoom",  "targetId": "concept-1", "scale": 1.4 }
  ]
}
```

Synchronisation rules (enforced by the system prompt, consumed by `playSyncResponse`):
- `speech` comes **first**; `|` marks segment boundaries. **#segments === #canvas actions.**
- Segment *i* is spoken while `canvas[i]` paints. Keep each segment ≤ 12 words.
- `canvas[0]` is almost always either:
  - `{ "action": "despawn", "id": "*" }` followed by `{ "action": "pan-zoom", "region": "origin" }` (clearing and returning home), OR
  - `{ "action": "pan-zoom", "region": "right" }` (moving to a new district without clearing)
- `canvas[0]` is **never** a bare `spawn` — always orient the camera first.
- `x, y, w, h` are **canvas units** (plain numbers). See SPATIAL_CANVAS.md for the coordinate system.
  - Within origin region (x: 0–100, y: 0–74): identical to old viewport-% system. **`y + h ≤ 74`** still applies per region.
  - Off-screen regions start at x: 110 (right), y: 85 (below). See named regions in SPATIAL_CANVAS.md.

### Canvas actions (`SyncCanvasAction` → `canvasStore`)

| action | fields | store call | notes |
|---|---|---|---|
| `spawn` | `type, id, x, y, w, h, data` | `spawn({ … })` | friendly type mapped to internal `WidgetType` |
| `despawn` | `id` (or `"*"`) | `despawn(id)` / `clear()` | |
| `zoom` | `targetId, scale` | `zoomCamera(targetId, scale)` | existing |
| `pan-zoom` | `region` OR `x, y`, optional `scale` | `panZoom({ … })` | **NEW** — primary camera move |
| `pan` | `dx, dy` | `panCamera(dx, dy)` | **NEW** — relative translate |
| `fit-all` | — | `fitAll()` | **NEW** — zoom to show all widgets |

Friendly→internal type map lives in `converse.ts` (`SYNC_TYPE_MAP`) and `orchestrate.ts`
(`TYPE_MAP`): `text-block→card`, `bullet-list→bullets`, `stat-card→stat`, `code-block→code`;
specialised types (`highlight-overlay`, `progress-bar`, `image-placeholder`, `email-ui`,
`network-graph`, `circle-stat`, `image-widget`) pass through.

---

## Secondary formats (auto-detected)

- **Dynamic dict format** — `widgets` is a `Record<id, decl>` (not an array). Validated by
  `dynamicCanvasResponseSchema` in `widgets/dynamicSchema.ts` (permissive: unknown enums
  `.catch()` to safe defaults), dispatched by `dispatchDynamicCanvas()`. Renders via
  `DynamicWidgetFactory`.
- **Legacy declarative `widgets` array** — Visual Translation Framework shape
  (`{ id, type, position:{top,left,width,height}, props }`). Dispatched by
  `dispatchWidgetDeclarations()`; supports a `staggerMs` for column reveals.

An optional `camera` field (`{ action: "zoom"|"zoom-out"|"spotlight"|"pan-zoom"|"fit-all", … }`)
is dispatched by `dispatchCameraAction()`. Now also handles `pan-zoom` and `fit-all`.

---

## System Prompt

`buildSystemPrompt(projectContext?)` (`src/ai/systemPrompt.ts`) returns the static
`SYSTEM_PROMPT` (JARVIS persona, the JSON-contract spec, the full widget catalog with size
guides, layout patterns, and constraints) and appends the active project's context string when
provided. For the school demo, the project context comes from `projectStore.getActiveContext()`,
which lists the active class, teacher (name + email), and homework with computed progress.

When adding a widget Claude is allowed to spawn, add a catalog entry here (friendly type name,
`data` schema, size guide, one example) — keep it in sync with `widgets/types.ts` and
`widgets/registry.tsx`.

Demo-relevant guidance to keep in the prompt:
- Speech: 1–2 short sentences per segment, matching what's shown.
- Always clear (`despawn "*"`) before a new topic.
- For "send work to my teacher": pre-fill `mail-compose` from the project's teacher data and
  confirm before the Gmail MCP send.
- QCM: never reveal correct answers before the student submits.
- Lesson: narrate one beat at a time; wait for confirmation before the next beat.

### Spatial canvas guidance (add to system prompt after widget catalog)

```
## SPATIAL CANVAS

The canvas is a virtual 300×300 unit space. The initial viewport shows x: 0–100, y: 0–74.
You can place widgets beyond x: 100 or y: 74 to create new off-screen districts.
The camera will pan-zoom to reveal them as part of your narrative.

### Named regions — use these in pan-zoom actions
- origin:       x: 5–95,   y: 5–70   → first response or reset
- right:        x: 110–190, y: 5–70   → follow-up on same topic
- far-right:    x: 215–285, y: 5–70   → third distinct topic / comparison
- below:        x: 5–95,   y: 85–150  → deeper dive / step 2
- below-right:  x: 110–190, y: 85–150 → cross-reference

### Camera rules (FOLLOW THESE EXACTLY)
1. canvas[0] is ALWAYS an orientation action. Never a bare spawn.
   - New topic or reset: { "action": "despawn", "id": "*" } then { "action": "pan-zoom", "region": "origin" }
   - Follow-up in new district: { "action": "pan-zoom", "region": "right" } (no despawn)
2. New topic → despawn "*" first, then pan-zoom to origin.
3. Follow-up / continuation → pan-zoom to right or below WITHOUT despawning.
4. Summarising across multiple districts → end with { "action": "fit-all" }
5. Per-turn area budget: max ~81 square units of widgets per response. Prefer fewer, richer widgets.

### Widget coordinate reminder
- Within origin (x: 0–100, y: 0–74): same as before.
- Right district: x starts at 110. Example: x: 112, y: 10, w: 38, h: 50.
- y + h ≤ 74 within each 100-unit vertical band (bottom 26 reserved for system UI).
- Never place a widget beyond x: 290 or y: 290.
```

---

## Two-Agent Architecture — Router + Tracker

Routing and progress are handled by **two independent agents**, both called by the main
conversation loop (`App.tsx → handleUtterance`). They never call each other: the Router decides
*what to do*; the Tracker observes *what was done*. See DEMO_SCRIPT.md for the full spec.

```
utterance ─▶ Agent 1: Intent Router ─┬─ feature  ─▶ demoStore.activateFeature(feature, params) ─┐
                                      └─ free-form ─▶ converse()  (unchanged)                     │
                                                                                      activation event
                                                                                                 ▼
                                                          Agent 2: Demo Progress Tracker (async, never awaited)
                                                          observes the event → marks demo-step IDs complete
```

Two axes that never mix:
- **Features** (Router output): `todo-overview`, `qcm`, `lesson`, `mail-compose`, `project-switch`,
  `free-form`. A *capability* to activate.
- **Demo steps** (Tracker output): `overview`, `history-qcm`, `send-homework`, `maths-lesson`. A
  *milestone* to mark complete. Tracking is independent of routing.

### Agent 1 — Intent Router (`src/ai/intentRouter.ts`)

Runs **first**, before the main AI response, so it must be cheap: a lightweight Haiku call
(`claude-haiku-4-5`, `temperature: 0`, small `maxOutputTokens`) that uses **AI judgment** (not exact
string matching) to emit a small **structured decision** — `{ intent, params, confidence }`, never
prose. It is given the project context, the available homeworks, and whether a lesson is currently
active, so it can route to a *specific* homework and gate `lesson-advance`.

```ts
type Intent =
  | "show-todo"        // "what do I have to do", "what's due today", "overview"
  | "open-homework"    // "let's do the history QCM", "start the maths lesson", "continue my homework"
  | "compose-mail"     // "send my work to my teacher", "email Ms. Martin", "submit this"
  | "switch-project"   // "go to maths", "switch to history", "open english"
  | "lesson-advance"   // "yes", "ok", "continue", "next" — ONLY when a lesson is active
  | "free-form";       // anything else → main AI loop

interface RoutingDecision {
  intent: Intent;
  params: { projectId?: string; homeworkId?: string };  // open-homework / compose-mail / switch-project
  confidence: number;                                   // 0..1
}

export async function routeIntent(
  utterance: string,
  ctx: {
    activeProjectId: string;
    projects: { id: string; name: string }[];
    homeworks: { id: string; projectId: string; subject: string; type: string; title: string }[];
    lessonActive: boolean;
  },
  timeoutMs = 2500,
): Promise<RoutingDecision>;
```

- `open-homework` resolves the homework type internally and spawns the right widget (qcm → quiz,
  lesson → intro dialog). `compose-mail` infers the teacher from `projectId`.
- A feature intent → `demoStore.activate(intent, params)` activates **immediately**, in any order
  (no "right step" gating). `switch-project` keeps the animated `projectStore.switchProject` path.
- **Confidence threshold** (`CONFIDENCE_THRESHOLD = 0.5`): a decision below it is downgraded to
  `free-form`. `free-form` (also the safe default on timeout/error/missing-key) → the existing
  `converse()` loop. A slow/uncertain Router never blocks the demo.
- An instant offline heuristic (`fastRoute`) short-circuits the obvious phrases before the Haiku call.

> This replaces the old binary `matchesDemoIntent` / `classifyDemoIntent` that returned a single id
> bound to the current step. The Router now returns an intent **+ params + confidence**, unifies
> qcm/lesson under `open-homework`, and adds the context-gated `lesson-advance`.

### Agent 2 — Demo Progress Tracker (`src/ai/progressTracker.ts`)

Runs **after** every feature activation, **asynchronously** (fire-and-forget — the UI never awaits
it). It compares the activation event against the demo steps (DEMO_SCRIPT.md) and marks any newly
satisfied step IDs complete in `demoStore.completed`. It **observes only** — it never blocks or
re-routes.

```ts
interface ActivationEvent {
  feature: string;                       // what the Router (or scripted button) activated
  params?: Record<string, unknown>;
  phase?: 'opened' | 'submitted' | 'sent' | 'mastered' | 'skipped';  // widget lifecycle
}
export async function trackActivation(
  event: ActivationEvent,
  completed: Set<string>,                // current step IDs
): Promise<Set<string>>;                 // updated step IDs → demoStore.markCompleted(...)
```

Default implementation is a **deterministic rule table** (recommended for demo reliability — instant,
no flake): e.g. `todo-overview/opened → overview`; `qcm + subject:history + submitted → history-qcm`;
`mail-compose + sent → send-homework`; `lesson + mastered|skipped → maths-lesson` (mastered = concepts
confirmed understood, not "beats played"). The async
signature keeps an LLM-backed version a drop-in upgrade with no call-site change.

The UI (Simulate-Voice button label + step counter in `DemoControls`) reads **only** the
Tracker-owned state in `demoStore` (`guidedLabel`, `progress()`).

---

## Lesson Tutor (`src/ai/lessonTutor.ts`)

A focused agent that only runs **inside an active lesson**, turning the Pythagoras walkthrough from a
slide scroll into a conversation. The lesson delivers **one idea per turn** and waits. While the
`lesson-pythagoras` widget is on the canvas, `App.handleUtterance` routes **every** student turn —
a question, "I don't get it", *or an affirmation* — to `demoStore.lessonRespond(utterance)` → the
Tutor (not the generic `converse()` loop, and **not** a blind `advanceLessonBeat()`). The tutor owns
the advance decision, so a vague "ok" is checked rather than auto-advanced.

### Comprehension state (session context, not a DB)

The tutor maintains a `ComprehensionState` for the **current topic** — held in `demoStore.comprehension`,
never persisted. It is passed into the tutor on every turn; the tutor reads it (to recognise a
follow-up as part of the same topic, and to pick an explanation approach it hasn't used yet on a
stuck concept), and returns the **updated** state alongside its reply. The orchestrator (`demoStore`)
saves that state and passes it back next turn.

```ts
type TutorMode = 'deepen' | 'reframe' | 'advance' | 'clarify';
type ConceptStatus = 'confirmed' | 'confused' | 'no-signal';
type ExplanationApproach = 'visual' | 'analogy' | 'formal' | 'example';

interface ConceptState {
  concept: string;
  status: ConceptStatus;                   // confirmed / confused / no signal yet
  approaches: ExplanationApproach[];        // every approach used → never repeat one when stuck
  lastApproach: ExplanationApproach | null;
}
interface ComprehensionState {             // demoStore.comprehension (session-only)
  topic: string;
  activeConcept: string;                   // which concept is active (replaces the linear beat index)
  concepts: ConceptState[];                // concepts introduced in this topic, in order
  subQuestions: string[];                  // specific sub-questions asked about this topic
  exchanges: { role: 'tutor' | 'student'; text: string }[];  // recent turns (capped) — continuity
}
// The tutor is handed the ACTIVE concept (a LessonConcept from the library, with its
// approach-tagged explanations) and selects which explanation to play by its decision.
export async function runLessonTutor(
  input: { concept: LessonConcept; state: ComprehensionState; utterance: string },
): Promise<{ mode: TutorMode; approach: ExplanationApproach; say: string; state: ComprehensionState }>;
```

The tutor picks **one of four** responses to the student's latest input:

- **`deepen`** — a follow-up / "more detail": go one level deeper on the SAME concept, using a
  **different representation than last time** (visual → numeric example, definition → analogy). Records
  the sub-question. A meaningful follow-up is itself a comprehension signal → sets status `confirmed`.
  Does not advance.
- **`reframe`** — confusion: re-explain the SAME concept from a completely different angle (an approach
  **not yet used** on it), acknowledging the confusion without condescension ("Let me try a different
  way."). Sets status `confused`. Does not advance.
- **`advance`** — a clear "yes / I understand": the tutor returns a brief validation (`say`), and the
  orchestrator calls `advanceConcept()` to introduce the next concept (one idea, slowly). Sets status
  `confirmed`.
- **`clarify`** — ambiguous input, silence, or a vague "ok" (a **weak signal**): ask one focused
  question (deeper / move on / adjacent) before assuming understanding. **Never advances** on a weak
  signal — the tutor only advances on a clear yes.

**Pacing constraints** (slower, deliberate delivery), enforced by the system prompt: at most **one new
concept per turn**; **always end** on a check-in question or invitation to continue, never a bare
statement; and **vary vocabulary** across turns on the same concept (e.g. "hypotenuse" → "the long
slanted side"). The end-on-a-hook rule is also guarded deterministically (`ensureHook`) so even a
fallback reply keeps its hook. Rendering paces with speech (LessonSVGCanvas): only the **current**
concept's highlight is fully lit, earlier ones recede to low opacity as reference, and future concepts
are **never** pre-drawn.

The state is updated deterministically inside `runLessonTutor` (`applyTurn`) from the model's decision
(mode + chosen approach) layered onto the previous state — the model owns *what to say* and *which
fresh approach* (from the concept's available approaches), the wrapper owns the invariants (only
`deepen`/`reframe` record an approach). On `advance`, `demoStore.advanceConcept()` confirms the active
concept and `introduceConcept()`s the next (→ active), persisting `confirmedConceptIds`. Progress and
the `mastered` event are computed by `syncLessonProgress()` from confirmed concepts.

**Reset on topic switch.** The state lives only as long as the topic. The **Intent Router** detects a
topic switch (`signalsTopicSwitch(intent)` → true for `show-todo` / `open-homework` / `compose-mail` /
`switch-project`); `App.handleUtterance` then calls `demoStore.clearComprehension()` to start fresh.
`lesson-advance` and an in-lesson `free-form` question are **not** switches, so the state survives them.

Like the Router/Tracker, a **deterministic offline fallback** keeps the lesson alive with no API key /
on timeout / error (CLAUDE.md rule #1): a regex classifier maps the utterance to one of the four modes
— crucially treating silence / a bare "ok" as `clarify`, not `advance` — and uses the beat's authored
`reframe`/`deepen` text plus a fresh-approach pick.

---

## Gmail MCP Integration

`src/ai/gmailMCP.ts` connects Gmail through the `mcp_servers` param on a **raw Anthropic
Messages API call** (not the AI-SDK stream). Required beta header: `mcp-client-2025-04-04`.

```ts
// Example request body
{
  model:       "claude-sonnet-4-6",
  max_tokens:  8096,
  system:      SYSTEM_PROMPT,
  mcp_servers: GMAIL_MCP_SERVERS,   // url-type server entry
  messages:    [...],
}
```

Two paths:
1. `converseWithGmail()` — real call with `mcp_servers`; Anthropic's backend handles the
   OAuth-authenticated Gmail MCP connection and Claude receives inbox JSON automatically.
2. `triggerMockGmailMCPResponse()` — spawns 5 hardcoded emails in a staggered column
   (5 cards × 16% height, 2% gap, from `y=4%`, `x=8%`, `w=42%`) for instant demo use with no
   key/OAuth.

**Send (the `send-homework` intent):** the `mail-compose` widget is pre-filled by the scripted
demo state. On Send (the widget-internal confirm), fire the Gmail MCP `send_email` tool best-effort. **If it fails (auth/network),
still play the "sent" animation** — the visual is what matters for the demo. Log the error
silently. The attachment is virtual (no real PDF is generated).

---

## Error Recovery

If the API call fails or returns malformed JSON:
1. `converse.ts` spawns a fallback `text-block` with the raw text — canvas is never blank.
2. For scripted steps, show the pre-authored ticker text for that step (from `demoStore`),
   keep the canvas as-is, and advance manually.
3. Never show an error state to the user. Scripted states are indistinguishable from live calls.
