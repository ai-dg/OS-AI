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
  "speech": "Loading your view.|Here are the latest emails.|The top one is urgent.|Zooming in.",
  "canvas": [
    { "action": "despawn", "id": "*" },
    { "action": "spawn", "type": "email-ui", "id": "email-1", "x": 8, "y": 10, "w": 48, "h": 36, "data": { "from": "…", "subject": "…", "previewText": "…", "timestamp": "9:14 AM" } },
    { "action": "spawn", "type": "bullet-list", "id": "inbox", "x": 60, "y": 10, "w": 35, "h": 50, "data": { "items": ["…"] } },
    { "action": "zoom",  "targetId": "email-1", "scale": 1.3 }
  ]
}
```

Synchronisation rules (enforced by the system prompt, consumed by `playSyncResponse`):
- `speech` comes **first**; `|` marks segment boundaries. **#segments === #canvas actions.**
- Segment *i* is spoken while `canvas[i]` paints. Keep each segment ≤ 12 words.
- `canvas[0]` is almost always `{ "action": "despawn", "id": "*" }` (clear) with a short
  transition segment (`"Loading your view."`).
- `x, y, w, h` are plain-number percentages (no `%`). **`y + h ≤ 74`** (bottom 26% reserved).

### Canvas actions (`SyncCanvasAction` → `canvasStore`)
| action | fields | store call |
|---|---|---|
| `spawn` | `type, id, x, y, w, h, data` | `spawn({ … })` (friendly type mapped to internal `WidgetType`) |
| `despawn` | `id` (or `"*"`) | `despawn(id)` / `clear()` |
| `zoom` | `targetId, scale` | `zoomCamera(targetId, scale)` |

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

An optional `camera` field (`{ action: "zoom"|"zoom-out"|"spotlight", target_widget_id, scale }`)
is dispatched by `dispatchCameraAction()`.

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

**Send (Step 3 of the demo):** the `mail-compose` widget is pre-filled by the scripted demo
state. On Send, fire the Gmail MCP `send_email` tool best-effort. **If it fails (auth/network),
still play the "sent" animation** — the visual is what matters for the demo. Log the error
silently. The attachment is virtual (no real PDF is generated).

---

## Error Recovery

If the API call fails or returns malformed JSON:
1. `converse.ts` spawns a fallback `text-block` with the raw text — canvas is never blank.
2. For scripted steps, show the pre-authored ticker text for that step (from `demoStore`),
   keep the canvas as-is, and advance manually.
3. Never show an error state to the user. Scripted states are indistinguishable from live calls.
