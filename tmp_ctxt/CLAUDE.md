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
  - **TTS** — `src/voice/AudioSynthesisService.ts`: **ElevenLabs** (`@elevenlabs/elevenlabs-js`, `eleven_flash_v2_5`, voice "George") with native `speechSynthesis` fallback.
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
    layoutManager.ts       # clampToSafeZone() + layout helpers + spatial canvas utils
  widgets/
    types.ts               # Widget interface + the WidgetType union
    registry.tsx           # WIDGETS map: WidgetType → render fn
    dynamicSchema.ts       # Zod schema for the dict-based dynamic canvas format
    DynamicWidgetFactory.tsx
    EmailWidget.tsx
    ImageWidget.tsx
    TaskList.tsx           # homework overview card
    QCMWidget.tsx          # multiple-choice quiz
    LessonWidget.tsx       # interactive lesson / SVG drawing
    MailCompose.tsx        # compose + attach + send
    Dialog.tsx             # yes/no prompt
  ai/
    client.ts              # Browser-side Anthropic provider + MODEL constant
    converse.ts            # streamText loop, JSON parse, speech/canvas sync playback
    orchestrate.ts         # dispatch helpers for the legacy + dynamic dict formats
    systemPrompt.ts        # JARVIS persona + widget catalog + spatial canvas guidance
    gmailMCP.ts            # Gmail MCP server config + mock inbox
  voice/
    AudioSynthesisService.ts
    useWhisper.ts / whisperWorker.ts
    useSpeech.ts
    speech.d.ts
  components/
    Ticker.tsx
    ResponseBox.tsx
    ChatBox.tsx
    JarvisOrb.tsx
    ProjectLabel.tsx
    DemoControls.tsx       # Reset Demo button + voice simulation button
  projects/
    projectStore.ts
    schoolData.ts
  tree/
    ConversationTree.tsx
  store/
    canvasStore.ts         # Zustand canvas widget state + camera (incl. spatial canvas)
    treeStore.ts
    demoStore.ts
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
    { "action": "zoom", "targetId": "ctx", "scale": 1.4 }
  ]
}
```

- `speech` is **first** and uses `|` to mark segment boundaries. **One segment per canvas action**, played in lock-step.
- `canvas[0]` is **always an orientation action** — either `despawn "*"` (clearing) or `pan-zoom` (moving to a district). Never a bare `spawn`.
- `x, y, w, h` are **canvas units** (plain numbers, no `%`). Within the origin region (0–100), they are identical to the old viewport-percent system. Beyond 100, they address off-screen districts. See SPATIAL_CANVAS.md.
- The canvas is a **virtual 300×300 unit space**. The viewport is a camera over it. The AI builds new districts as conversation grows; the user can freely navigate when the AI is idle.

### Spatial Canvas (key addition)

The canvas extends beyond the visible viewport. Content placed at `x > 100` is off-screen right; at `y > 74` (in bands of 100) is off-screen below. The AI uses **named regions** (`origin`, `right`, `far-right`, `below`, `below-right`) to place and navigate content. See SPATIAL_CANVAS.md for the full spec.

**Camera lock**: during AI speech, the camera is locked — user pan/zoom events are ignored. When the AI is idle, the user can navigate freely (drag to pan, scroll to zoom). `Cmd+0` / `Ctrl+0` fits all content in view. See ANIMATIONS.md for camera timing.

### Scripted vs live
**Scripted demo steps** (the school flow) don't go through Claude — `demoStore` calls `useCanvasStore.getState().spawn(...)` directly. All scripted steps use the `origin` region. Live free-form questions go through `converse()` and can build spatial districts.

---

## State Shape
```ts
// store/canvasStore.ts (Zustand)
{
  widgets: Record<string, Widget>,
  order: string[],
  // Camera
  cameraOffsetX: number,          // canvas units, default 0
  cameraOffsetY: number,          // canvas units, default 0
  cameraZoomScale: number,        // default 1.0
  cameraMode: "idle" | "zoom" | "spotlight",
  cameraTargetId: string | null,
  minZoomScale: number,           // computed from widget bounding box
  isAISpeaking: boolean,          // LOCK FLAG — blocks user camera input
  // Actions
  // spawn / despawn / clear / zoomCamera / spotlightCamera / resetCamera / snapshot / restore
  // panZoom / panCamera / fitAll (NEW)
}
```

---

## Non-Negotiable Rules
1. **Never break the demo loop.** Malformed JSON → fallback `text-block`. Canvas never blank.
2. **Black only.** Background is `#080808`. No white backgrounds anywhere.
3. **Canvas units, not px.** All widget `x/y/w/h` are canvas units (0–300 range). Within the origin region (0–100) they behave identically to the old viewport-percent system.
4. **Reserved zone per region: `y + h ≤ 74` within each 100-unit vertical band** — same bottom-26 rule as before, applied per region.
5. **One font.** `font-mono` everywhere. Scale: 10px labels, ~13px body, 24px headings, 48px stat numbers.
6. **Animation via Framer Motion** for widgets; **CSS transitions** for camera moves. Keep it short (200–400ms).
7. **No visible browser chrome.** `overflow: hidden` on body. No scrollbars on the canvas.
8. **localStorage key prefix:** `jarvis_project_` only.
9. **Reset Demo must be perfect.** Clears all widgets, resets camera to origin (0,0) at scale 1.0, sets `isAISpeaking: false`. No artifacts.
10. **Camera lock is sacred.** `isAISpeaking` is always set to `false` in the `finally` block of `converse()`. It can never be left permanently locked.
11. **Add a widget the existing way.** New type → `widgets/types.ts` → `widgets/registry.tsx` → catalog entry in `ai/systemPrompt.ts` if Claude should spawn it live.

## Key Files to Know
| File | What it does |
|---|---|
| `src/ai/converse.ts` | streamText loop, JSON parse, speech↔canvas sync, camera lock/unlock |
| `src/ai/client.ts` | Browser-side Anthropic provider + `MODEL` |
| `src/ai/orchestrate.ts` | Dispatch for legacy + dynamic formats; type-name mapping |
| `src/ai/systemPrompt.ts` | JARVIS persona + widget catalog + **spatial canvas guidance** |
| `src/ai/gmailMCP.ts` | Gmail MCP server config (+ mock inbox) |
| `src/widgets/registry.tsx` | `WIDGETS` map — every renderer |
| `src/store/canvasStore.ts` | Canvas widget + camera state incl. **spatial canvas fields** |
| `src/canvas/layoutManager.ts` | `clampToSafeZone()` + **`resolveRegion()` + `computeMinZoom()`** |
| `src/projects/projectStore.ts` | Project switch / save / restore |
| `src/projects/schoolData.ts` | Pre-seeded demo data |
| `src/store/demoStore.ts` | Demo step state machine |
| `src/voice/AudioSynthesisService.ts` | ElevenLabs TTS |

## See Also
- `.claude/docs/SPATIAL_CANVAS.md` — **canonical spec** for the virtual canvas coordinate system, named regions, camera actions, and lock behaviour *(NEW)*
- `.claude/docs/WIDGETS.md` — widget specs incl. QCM, Lesson, TaskList, MailCompose, Dialog
- `.claude/docs/AI_CONTRACT.md` — JSON contract, `converse.ts` pipeline, new camera actions, Gmail MCP
- `.claude/docs/PROJECTS.md` — school project folder system, switch animation spec
- `.claude/docs/DEMO_SCRIPT.md` — 8-step scripted demo
- `.claude/docs/ANIMATIONS.md` — all transition specs incl. camera move timings *(updated)*
- `.claude/docs/SCHOOL_DATA.md` — full pre-seeded data reference
- `.claude/docs/BUILD_PLAN.md` — implementation order

## Setup
```bash
npm install
printf 'VITE_ANTHROPIC_API_KEY=sk-ant-...\nVITE_ELEVENLABS_API_KEY=...\n' > .env.local
npm run dev   # → http://localhost:5173
```
Use **Chrome or Edge** — the demo relies on Web Audio + (optionally) the Web Speech API.
