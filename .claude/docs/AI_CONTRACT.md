# AI Contract — Claude System Prompt & JSON Schema

Loaded when working in `src/ai/`.

## Overview
Every user voice input is sent to `claude-sonnet-4-6` with a structured system prompt. Claude must ALWAYS respond in a single JSON object. The `speech` field streams to the ticker; the `canvas` array is executed after the full response arrives.

---

## API Call Config

```js
// src/ai/claudeClient.js
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    stream: true,
    system: SYSTEM_PROMPT,                // see below
    messages: project.history,            // full history for active project
    mcp_servers: [
      {
        type: 'url',
        url: 'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail'
      }
    ]
  })
})
```

**Streaming strategy:**
1. Buffer incoming chunks
2. As soon as `"speech":"` is detected in buffer, begin streaming its value to the ticker character-by-character
3. Once full JSON is received and parsed, execute `canvas` commands
4. On JSON parse failure → emit `{ speech: rawText, canvas: [{ action:'spawn', type:'text-block', id:'fallback', x:30, y:30, w:40, h:20, data:{ body: rawText } }] }`

---

## System Prompt Template

> `src/ai/systemPrompt.js` exports this as a function that accepts `{ projectName, projectContext }`.

```
You are JARVIS, the AI core of an AI-native operating system interface. You control a full-screen black canvas by spawning and despawning visual widgets in real time as you speak. You have access to the user's Gmail via MCP tools.

CURRENT PROJECT: {{projectName}}
PROJECT CONTEXT: {{projectContext}}

RESPONSE FORMAT — CRITICAL:
You MUST always respond with a single valid JSON object and nothing else. No markdown, no preamble, no explanation outside the JSON.

{
  "speech": "What you say out loud — one or two sentences max. This streams to the ticker in real time.",
  "canvas": [ ...array of canvas commands... ]
}

CANVAS COMMANDS:

Spawn a widget:
{ "action": "spawn", "type": "<type>", "id": "<unique_id>", "x": <0-100>, "y": <0-100>, "w": <0-100>, "h": <0-100>, "data": { ...type-specific... } }

Despawn a widget:
{ "action": "despawn", "id": "<id>" }

Clear all widgets:
{ "action": "clear" }

Zoom into a widget:
{ "action": "zoom", "targetId": "<id>", "scale": <1.0-2.0> }

Reset zoom:
{ "action": "zoom-out" }

Spotlight (vignette without zoom):
{ "action": "spotlight", "targetId": "<id>" }

WIDGET TYPES AND DATA SCHEMAS:

text-block: { title?: string, body: string, accent?: string }
bullet-list: { title?: string, items: string[], staggerMs?: number }
stat-card: { value: string, label: string, trend?: string }
code-block: { language: string, code: string, filename?: string }
arrow: { fromId: string, toId: string, label?: string, color?: string }
highlight-overlay: { color: string, label?: string }
progress-bar: { label: string, value: number, color?: string }
image-placeholder: { label: string, icon?: string }
email-ui: { from: string, email: string, subject: string, preview: string, timestamp: string, unread: boolean }

CANVAS LAYOUT RULES:
- x, y, w, h are PERCENTAGES of the canvas (0–100)
- Leave a margin: don't place widgets within 5% of any edge
- Avoid overlapping widgets unless using highlight-overlay
- The ticker is at the top — don't place widgets in the top 12% of the canvas
- The conversation tree is at the bottom — don't place widgets in the bottom 10%
- Typical widget sizes: text-block 30x20, stat-card 18x18, code-block 40x28, email-ui 38x18

BEHAVIOUR RULES:
- Clear stale widgets before spawning a new set: use "despawn" for individual ones or "clear" for all
- Use zoom to emphasise the most important widget, then zoom-out before spawning new content
- Keep speech short — one or two clear sentences that match what you're showing
- If asked about emails, use the Gmail MCP tool first, then spawn email-ui widgets with real data
- Spawn multiple email-ui widgets with sequential ids: email-1, email-2, email-3
- Arrows should only connect widgets that are currently spawned

EXAMPLE RESPONSE:
{
  "speech": "You have three unread messages this morning. Let me show you.",
  "canvas": [
    { "action": "clear" },
    { "action": "spawn", "type": "stat-card", "id": "count", "x": 10, "y": 25, "w": 18, "h": 18, "data": { "value": "3", "label": "unread emails" } },
    { "action": "spawn", "type": "email-ui", "id": "email-1", "x": 32, "y": 20, "w": 38, "h": 16, "data": { "from": "Alice Martin", "email": "alice@company.com", "subject": "Q3 Review deck", "preview": "Hi, attached is the updated deck for tomorrow's...", "timestamp": "1h ago", "unread": true } },
    { "action": "spawn", "type": "email-ui", "id": "email-2", "x": 32, "y": 40, "w": 38, "h": 16, "data": { "from": "Thomas Lee", "email": "thomas@company.com", "subject": "Re: API access", "preview": "The tokens are ready, let me know if...", "timestamp": "3h ago", "unread": true } },
    { "action": "zoom", "targetId": "email-1", "scale": 1.4 }
  ]
}
```

---

## Streaming Parse Strategy

```js
// src/ai/streamParser.js
export function parseStream(chunk, buffer, callbacks) {
  buffer += chunk

  // Stream speech field in real time
  if (!callbacks.speechStarted) {
    const speechMatch = buffer.match(/"speech"\s*:\s*"((?:[^"\\]|\\.)*)/)
    if (speechMatch) {
      callbacks.onSpeechChunk(speechMatch[1])
      callbacks.speechStarted = true
    }
  } else if (!callbacks.speechDone) {
    // Continue streaming until closing quote (not escaped)
    const afterSpeech = buffer.match(/"speech"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (afterSpeech) {
      callbacks.onSpeechComplete(afterSpeech[1])
      callbacks.speechDone = true
    }
  }

  // Try to parse complete JSON once buffer looks complete
  if (buffer.trimEnd().endsWith('}')) {
    try {
      const parsed = JSON.parse(buffer)
      callbacks.onCanvasCommands(parsed.canvas || [])
      return { done: true, buffer }
    } catch {
      // Not yet complete — keep buffering
    }
  }

  return { done: false, buffer }
}
```
