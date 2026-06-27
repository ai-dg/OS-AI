# Project Folders System

Loaded when working in `src/projects/`.

## Concept
Projects are **invisible to the user** — no UI, no menu, no list. They are context containers that each own a full conversation history, canvas state, and conversation tree. Switching projects feels like a scene cut: the canvas wipes, new context loads, and the agent is instantly in a different "mode."

The only visual trace of the active project is a **tiny label** at the very top-left of the canvas:
- Font: 10px monospace
- Color: `rgba(255,255,255,0.25)`
- No background, no border
- Fades in over 600ms on switch, persists until next switch

---

## State Shape

```js
// src/projects/projectStore.js

const DEFAULT_PROJECTS = {
  email: {
    id: 'email',
    name: 'Email & Comms',
    context: 'The user is managing their email inbox. Gmail MCP is active. Prioritise email-ui widgets and communication-related information.',
    history: [],        // Claude API message history [{role, content}]
    canvasState: [],    // Array of currently active Widget objects
    tree: [],           // Array of TreeNode objects (see TREE section below)
    activeNodeId: null,
  },
  code: {
    id: 'code',
    name: 'Code Review',
    context: 'The user is doing technical code review work. Prioritise code-block, bullet-list, and stat-card widgets. Use technical language.',
    history: [],
    canvasState: [],
    tree: [],
    activeNodeId: null,
  },
  hackathon: {
    id: 'hackathon',
    name: 'Hackathon Pitch',
    context: 'The user is preparing their hackathon pitch for Anthropic × Y Combinator judges. Prioritise stat-card, bullet-list, and text-block widgets. Think big, think vision.',
    history: [],
    canvasState: [],
    tree: [],
    activeNodeId: null,
  }
}

// Top-level app state
const appState = {
  activeProjectId: 'email',
  projects: { ...DEFAULT_PROJECTS }
}
```

---

## Switch Trigger

Two ways to switch projects:

**Keyboard (instant, for demo control):**
```
Cmd+1  →  email
Cmd+2  →  code
Cmd+3  →  hackathon
```

**Voice (Claude detects intent):**
If Claude's response `speech` contains project switch intent, include in canvas array:
```js
{ "action": "switch-project", "projectId": "code" }
```
The canvas renderer intercepts this command and triggers the switch sequence.

Example phrases Claude should detect:
- "Switch to my email project" → `switch-project: email`
- "Let's go to code review" → `switch-project: code`
- "Open the hackathon pitch" → `switch-project: hackathon`

---

## Switch Sequence

```
Total duration: ~950ms

1. [0ms]    Save current canvas widgets to outgoing project's canvasState
2. [0ms]    Save current history to outgoing project's history
3. [0ms]    Begin widget fade-out: ALL widgets opacity 1→0 over 250ms simultaneously
4. [0ms]    Begin scan-line: 1px white line (opacity 0.15) sweeps top→bottom over 400ms
5. [250ms]  Canvas is clear — set activeProjectId to new project
6. [300ms]  Mic indicator pulses once (scale 1→1.3→1, 300ms)
7. [400ms]  Scan-line completes
8. [450ms]  Restore new project's canvasState — widgets spawn with 50ms stagger
9. [450ms]  Swap Claude history to new project's history
10.[450ms]  Update system prompt context string to new project's context
11.[500ms]  Project name label fades in top-left over 600ms
```

**Scan-line CSS:**
```css
.scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 1px;
  background: rgba(255,255,255,0.15);
  animation: scan 400ms ease-in-out forwards;
}
@keyframes scan {
  from { top: 0; opacity: 0.15; }
  to   { top: 100%; opacity: 0; }
}
```

---

## localStorage Persistence

Save on every project switch and every new conversation turn:
```js
// Key format: jarvis_project_<id>
localStorage.setItem(`jarvis_project_${project.id}`, JSON.stringify({
  history: project.history,
  canvasState: project.canvasState,
  tree: project.tree,
  activeNodeId: project.activeNodeId,
}))
```

Load on app init:
```js
for (const id of Object.keys(DEFAULT_PROJECTS)) {
  const saved = localStorage.getItem(`jarvis_project_${id}`)
  if (saved) {
    const parsed = JSON.parse(saved)
    appState.projects[id] = { ...DEFAULT_PROJECTS[id], ...parsed }
  }
}
```

---

## Pre-Seeded Demo Canvas States

For the demo, each project should have a pre-loaded initial canvas state so judges see something immediately on switch. Seed these at init if the project has no saved state:

**Email & Comms (initial):**
```js
canvasState: [
  { id: 'email-intro', type: 'text-block', x: 20, y: 25, w: 60, h: 20,
    data: { title: 'Email & Comms', body: 'Ask me about your inbox, draft a reply, or summarize your messages.', accent: '#6366f1' } }
]
```

**Code Review (initial):**
```js
canvasState: [
  { id: 'code-intro', type: 'code-block', x: 15, y: 25, w: 70, h: 35,
    data: { language: 'javascript', filename: 'ready to review...', code: '// Paste a PR URL or describe a file\n// and I\'ll walk you through it.' } }
]
```

**Hackathon Pitch (initial):**
```js
canvasState: [
  { id: 'pitch-stat', type: 'stat-card', x: 10, y: 25, w: 22, h: 22,
    data: { value: '24h', label: 'to build this', trend: '↑ ambition level: max' } },
  { id: 'pitch-text', type: 'text-block', x: 38, y: 25, w: 52, h: 22,
    data: { title: 'JARVIS — AI-Native OS', body: 'The operating system for the AI era. One screen. One agent. Infinite context.', accent: '#f59e0b' } }
]
```
