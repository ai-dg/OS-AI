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

The school demo is primarily **scripted**: the linear demo steps are driven by `demoStore`,
which calls `useCanvasStore.getState().spawn(...)` directly with pre-authored data — no Claude
call. Live free-form questions (after the scripted demo) go through `converse()`.

---

## Client Config

```ts
// src/ai/client.ts
import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
export const hasApiKey = Boolean(apiKey);

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
  onSentence: (sentence: string) => void;
  onDelta?: (partial: string) => void;
  onSpeechDelta?: (speechText: string) => void;
  synthesize?: (text: string) => Promise<{ play(): Promise<void>; durationMs: number }>;
}
```
`synthesize` is wired to `AudioSynthesisService` (ElevenLabs) in `App.tsx`.

---

## Primary format — `{ speech, canvas }`

```json
{
  "speech": "Let me show you something new.|Here are the key concepts.|And here's the equation.|Zooming in.",
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
- Segment *i* is spoken while `canvas[i]` executes. Keep each segment ≤ 12 words.
- `canvas[0]` is almost always either:
  - `{ "action": "despawn", "id": "*" }` followed by `{ "action": "pan-zoom", "region": "origin" }` (clearing and returning home), OR
  - `{ "action": "pan-zoom", "region": "right" }` (moving to a new district without clearing)
- `canvas[0]` is **never** a bare `spawn` — always orient the camera first.
- `x, y, w, h` are **canvas units** (plain numbers). See SPATIAL_CANVAS.md for the coordinate system.
- Within the origin region (x: 0–100, y: 0–74), coordinates behave identically to the old system.
- For off-screen regions, use coordinates from the named regions in SPATIAL_CANVAS.md.

### Canvas actions (`SyncCanvasAction` → `canvasStore`)

| action | fields | store call | notes |
|---|---|---|---|
| `spawn` | `type, id, x, y, w, h, data` | `spawn({ … })` | type-name mapped to internal `WidgetType` |
| `despawn` | `id` (or `"*"`) | `despawn(id)` / `clear()` | |
| `zoom` | `targetId, scale` | `zoomCamera(targetId, scale)` | existing |
| `pan-zoom` | `region` OR `x, y`, optional `scale` | `panZoom({ … })` | **NEW** — primary camera move |
| `pan` | `dx, dy` | `panCamera(dx, dy)` | **NEW** — relative translate |
| `fit-all` | — | `fitAll()` | **NEW** — zoom to show all widgets |

Friendly→internal type map in `converse.ts` (`SYNC_TYPE_MAP`) and `orchestrate.ts` (`TYPE_MAP`):
`text-block→card`, `bullet-list→bullets`, `stat-card→stat`, `code-block→code`; specialised
types (`highlight-overlay`, `progress-bar`, `image-placeholder`, `email-ui`, `network-graph`,
`circle-stat`, `image-widget`) pass through unchanged.

---

## Secondary formats (auto-detected)

- **Dynamic dict format** — `widgets` is a `Record<id, decl>` (not an array). Validated by
  `dynamicCanvasResponseSchema`, dispatched by `dispatchDynamicCanvas()`.
- **Legacy declarative `widgets` array** — `{ id, type, position:{top,left,width,height}, props }`.
  Dispatched by `dispatchWidgetDeclarations()`; supports `staggerMs` for column reveals.

An optional `camera` field (`{ action: "zoom"|"zoom-out"|"pan-zoom"|"fit-all", … }`) is
dispatched by `dispatchCameraAction()`. Now also handles `pan-zoom` and `fit-all`.

---

## System Prompt (spatial canvas additions)

`buildSystemPrompt(projectContext?)` in `src/ai/systemPrompt.ts` includes the JARVIS persona,
the JSON-contract spec, the full widget catalog, and now:

### Spatial canvas guidance (add to system prompt)

```
## SPATIAL CANVAS

The canvas is a virtual 300×300 unit space. The viewport starts at origin (0–100 × 0–74).
New content can be placed BEYOND the viewport; pan-zoom moves the camera to reveal it.

### Named regions (use these for placement and pan-zoom targets)
- origin:       x: 5–95,   y: 5–70   → first response, reset state
- right:        x: 110–190, y: 5–70   → follow-up on same topic
- far-right:    x: 215–285, y: 5–70   → third distinct topic or comparison
- below:        x: 5–95,   y: 85–150  → deeper dive or step 2
- below-right:  x: 110–190, y: 85–150 → cross-reference between topics

### Camera rules (MANDATORY)
1. canvas[0] is ALWAYS an orientation action — never a bare spawn.
   - Clearing the canvas: canvas[0] = { "action": "despawn", "id": "*" }
     then canvas[1] = { "action": "pan-zoom", "region": "origin", "scale": 1.0 }
   - Moving to new district: canvas[0] = { "action": "pan-zoom", "region": "right" }
2. New topic (not follow-up): despawn "*" first, then pan-zoom to origin.
3. Follow-up on same topic: pan-zoom to right/below WITHOUT despawning.
   Previous content stays visible; the user can fit-all to see everything.
4. End of summary across multiple districts: issue { "action": "fit-all" } to zoom out.
5. Per-turn placement budget: place at most ~81 square units of widgets per response
   (e.g. three 27-unit widgets, or six 13-unit widgets). Quality over quantity.

### Coordinate reminders
- Within origin region (x: 0–100): coordinates are identical to the old system.
- Off-screen content starts at x: 110 (right district).
- y + h ≤ 74 (within each 100-unit vertical band) — bottom 26 units reserved for system UI.
- Never place a widget beyond x: 290 or y: 290.
```

---

## Gmail MCP Integration

`src/ai/gmailMCP.ts` connects Gmail through the `mcp_servers` param on a **raw Anthropic
Messages API call** (not the AI-SDK stream). Required beta header: `mcp-client-2025-04-04`.

```ts
{
  model:       "claude-sonnet-4-6",
  max_tokens:  8096,
  system:      SYSTEM_PROMPT,
  mcp_servers: GMAIL_MCP_SERVERS,
  messages:    [...],
}
```

Two paths:
1. `converseWithGmail()` — real call with `mcp_servers`.
2. `triggerMockGmailMCPResponse()` — spawns 5 hardcoded emails in a staggered column for demo.

**Send (Step 3 of the demo):** fire the Gmail MCP `send_email` tool best-effort. If it fails,
still play the "sent" animation — the visual is what matters. Log the error silently.

---

## Error Recovery

If the API call fails or returns malformed JSON:
1. `converse.ts` spawns a fallback `text-block` with the raw text — canvas never blank.
2. `isAISpeaking` is always set to `false` in the `finally` block — camera never stays locked.
3. For scripted steps, show the pre-authored ticker text and keep the canvas as-is.
4. Never show an error state to the user.
