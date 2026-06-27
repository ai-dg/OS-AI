# Demo Script & Mode

Loaded when working on `src/components/DemoMode.jsx` or polishing the demo.

## Overview
The demo runs as a **guided mode** triggered by pressing `D`. Arrow keys advance/rewind steps. Each step has a scripted canvas state and suggested spoken words. Total runtime: **under 4 minutes**.

The step counter is barely visible: bottom-right, 8px monospace, `rgba(255,255,255,0.2)`. Format: `2 / 7`.

---

## Keyboard Shortcuts (Global)

| Key | Action |
|---|---|
| `Space` | Push-to-talk (hold to speak) |
| `→` / `↓` | Next demo step |
| `←` / `↑` | Previous demo step |
| `D` | Enter / exit demo mode |
| `Escape` | Exit demo mode, clear canvas |
| `Cmd+1` | Switch to Email & Comms project |
| `Cmd+2` | Switch to Code Review project |
| `Cmd+3` | Switch to Hackathon Pitch project |

---

## The 7 Steps

### Step 1 — The Hook (~30s)
**Canvas state:** Blank. Just the pulsing mic indicator and ambient particles.
**Speaker says:**
> "Every OS since 1984 has looked the same. Windows. Folders. Apps. Browsers. We're not building an app. We built something different."

**Canvas commands on enter:**
```js
[{ action: 'clear' }]
// Just let the black canvas breathe
```

---

### Step 2 — First Interaction (~60s)
**Speaker says:**
> "One screen. You speak. The AI responds — and builds the interface around you."

Then speaks to the mic:
> *"Explain the three pillars of our product."*

**Expected Claude output:** Spawns a `bullet-list` with 3 items + a `text-block` heading. Ticker streams the explanation.

**Scripted fallback canvas** (if live AI fails):
```js
[
  { action: 'spawn', type: 'text-block', id: 'pillar-title', x: 10, y: 18, w: 80, h: 12,
    data: { title: 'The AI-Native OS', body: 'Three pillars redefine how humans interact with software.' } },
  { action: 'spawn', type: 'bullet-list', id: 'pillars', x: 15, y: 35, w: 70, h: 40,
    data: { items: ['Adaptive UI — the interface assembles itself around your intent', 'Persistent Memory — the system learns how you think', 'Revised Interaction — the AI executes, not assists'] } }
]
```

---

### Step 3 — Gmail Live Demo (~60s)
**Speaker says:**
> "This isn't a mockup. When I ask about my emails..."

Then speaks to mic:
> *"Show me my latest emails."*

**Expected:** Claude calls Gmail MCP → spawns real `email-ui` cards with staggered 200ms timing.

**Scripted fallback canvas:**
```js
[
  { action: 'clear' },
  { action: 'spawn', type: 'stat-card', id: 'email-count', x: 8, y: 25, w: 18, h: 18,
    data: { value: '4', label: 'unread emails', trend: '↑ 2 since yesterday' } },
  { action: 'spawn', type: 'email-ui', id: 'email-1', x: 30, y: 20, w: 38, h: 15,
    data: { from: 'YC Partner', email: 'partner@ycombinator.com', subject: 'Demo Day — Final Schedule', preview: 'Teams should be ready 15 minutes before...', timestamp: '1h ago', unread: true } },
  { action: 'spawn', type: 'email-ui', id: 'email-2', x: 30, y: 38, w: 38, h: 15,
    data: { from: 'Anthropic Team', email: 'team@anthropic.com', subject: 'API access confirmed', preview: 'Your extended rate limits are active...', timestamp: '3h ago', unread: true } }
]
```

---

### Step 4 — Zoom & Focus (~30s)
**Speaker says:**
> "The AI knows what matters. It directs your attention."

**Canvas commands:**
```js
[
  { action: 'zoom', targetId: 'email-1', scale: 1.6 },
  { action: 'spotlight', targetId: 'email-1' }
]
```

Pause 3 seconds, then:
```js
[{ action: 'zoom-out' }]
```

---

### Step 5 — Conversation Tree (~30s)
**Speaker says:**
> "Every moment of context is preserved. Like Git for your mind — you can travel back."

**Action:** Click on a past node in the conversation tree. Canvas fades and restores a previous state.

Point at the node graph: "Every node is a moment. Every branch is a thought."

---

### Step 6 — Project Switch: Code Review (~30s)
**Speaker says:**
> "And it's not just one context. Watch."

**Press `Cmd+2`** (or say *"Switch to code review"*).

Canvas wipes → scan line → Code Review project loads with pre-seeded code-block widget.

> "Instantly. Different project. Different memory. Different agent mode."

---

### Step 7 — Vision Close (~60s)
**Press `Cmd+3`** → switch to Hackathon Pitch project.

Canvas loads with stat-card "24h" and vision text-block.

**Speaker says:**
> "This is a 24-hour demo. But this is not a demo. This is the operating system of the AI era."
>
> "Right now, AI is a passenger bolted onto a car it didn't design. We're building the car."
>
> "One black screen. One agent. Everything you need, assembled in real time, for you."
>
> "We are 42AI. And we're just getting started."

---

## Demo Failure Recovery

If Claude API returns an error mid-demo:
1. Ticker shows: `"Let me pull that up..."` (already shown before error)
2. Canvas stays as-is (no flicker)
3. Use arrow key to show scripted fallback for that step
4. Speak naturally over it — judges won't know it's a fallback

**Never say "the API is down."** The scripted fallbacks are indistinguishable from live calls.

---

## Timing Guide

| Step | Duration | Cumulative |
|---|---|---|
| 1 — Hook | 30s | 0:30 |
| 2 — First interaction | 60s | 1:30 |
| 3 — Gmail live demo | 60s | 2:30 |
| 4 — Zoom & focus | 30s | 3:00 |
| 5 — Conversation tree | 30s | 3:30 |
| 6 — Project switch | 30s | 4:00 |
| 7 — Vision close | 60s | 5:00 |

**Target: under 4 minutes.** Cut step 5 if running long.
