# Widget System Spec

Loaded when working in `src/widgets/`.

## Overview
All widgets are absolutely positioned on the black canvas using `%` units. They are rendered by `WidgetRenderer.jsx` which switches on `widget.type`. Every widget shares the same lifecycle: **spawn → idle → despawn**.

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

## Widget Types

### `text-block`
General purpose text card.
```js
data: {
  title: string,   // optional heading
  body: string,    // main content, supports \n for line breaks
  accent: string,  // optional left border color e.g. '#6366f1'
}
```
Render: dark card, title in 14px semibold, body in 13px regular, 1px left border if accent set.

---

### `bullet-list`
Items animate in one-by-one with 150ms stagger.
```js
data: {
  title: string,           // optional
  items: string[],         // each item is one bullet
  staggerMs: number,       // default 150
}
```
Render: each bullet preceded by a `›` in accent color. Items fade+slide in from left.

---

### `stat-card`
Big number with a label. Used for emphasis.
```js
data: {
  value: string,    // e.g. "3", "94%", "$2.4M"
  label: string,   // e.g. "unread emails", "test coverage"
  trend: string,   // optional e.g. "↑ 12% vs last week"
}
```
Render: value at 48px, label at 11px below, trend in green/red at 10px.

---

### `code-block`
Syntax-highlighted code snippet.
```js
data: {
  language: string,  // e.g. 'javascript', 'python', 'bash'
  code: string,      // the code content
  filename: string,  // optional filename label at top
}
```
Render: monospace, dark bg (`#0d0d0d`), basic keyword highlighting (reserved words in purple `#a78bfa`, strings in green `#34d399`, comments in gray). No external syntax lib — hand-coded highlight for demo speed.

---

### `arrow`
SVG line connecting two widgets.
```js
data: {
  fromId: string,   // id of source widget
  toId: string,     // id of target widget
  label: string,    // optional midpoint label
  color: string,    // default 'rgba(255,255,255,0.4)'
}
```
Render: SVG `<line>` drawn between widget center points. Arrowhead at target end. Animates in by drawing from 0% to 100% stroke-dashoffset over 400ms.

---

### `highlight-overlay`
Colored wash over a canvas region to draw attention.
```js
data: {
  color: string,   // e.g. 'rgba(99,102,241,0.12)'
  label: string,   // optional text label centered in region
}
```
Render: absolutely positioned `div` with bg color and optional centered label in matching color at higher opacity.

---

### `progress-bar`
Animated fill bar.
```js
data: {
  label: string,
  value: number,    // 0–100 (percentage)
  color: string,   // fill color, default '#6366f1'
}
```
Render: thin bar (8px height), fills from 0 to `value` over 1000ms ease-out on spawn.

---

### `image-placeholder`
Dashed box referencing a diagram that can't be generated.
```js
data: {
  label: string,   // e.g. "Architecture Diagram", "User Flow"
  icon: string,    // optional emoji e.g. "🗂️"
}
```
Render: dashed 1px border `rgba(255,255,255,0.2)`, centered label and icon, bg `rgba(255,255,255,0.02)`.

---

### `email-ui`
Full email-client widget: scrollable list on the left, detail panel on the right. Clicking an item selects it and marks it read.

**When to use:** User asks to check email, read inbox, find a message, or show Gmail. Use Gmail MCP to populate real data.

**Spatial recommendation:** Full-width preferred — `x:5, y:10, w:90, h:80` (single widget only).

**Multi-email schema (preferred):**
```js
data: {
  emails: [
    {
      id: string,          // unique per email
      from: string,        // display sender name e.g. "Sarah Connor"
      fromEmail: string,   // sender email address e.g. "sarah@acme.com"
      subject: string,
      preview: string,     // first ~100 chars of body (shown in list row)
      body: string,        // full email body (shown in detail panel)
      date: string,        // e.g. "2h ago", "Jun 25"
      read: boolean,
      labels: string[],    // optional tag chips e.g. ["urgent", "work"]
    }
  ],
  selectedId: string | null,  // pre-selected email id, or null
  unreadCount: number,        // shown as badge in header
}
```
Render: left column (42% width) lists emails — avatar initials, unread dot, sender bold if unread, subject, date. Right panel always visible; shows subject/from/date header + `body` (falls back to `preview`) + label chips. "Select an email" placeholder when nothing selected. Clicking an email sets selectedId in local state and marks it read (60% opacity).

**Single-card schema (legacy / AI system prompt):**
```js
data: {
  from: string,       // sender name or address
  subject: string,
  preview: string,    // first ~100 chars of body
  timestamp: string,  // e.g. "2h ago", "Yesterday"
  unread: boolean,
}
```
Render: avatar circle (initials, hashed color), sender bold if unread, subject line, preview in muted white. Multiple email-ui widgets spawn with 200ms stagger.

---

## Canvas Commands (not widget types)

These come in the `canvas` array but don't create widgets:

### `zoom`
```js
{ action: 'zoom', targetId: string, scale: number }
// scale: 1.0 = no zoom, 1.5–2.0 typical range
// Non-target widgets fade to opacity 0.2
// Smooth CSS transform transition 400ms ease-in-out
```

### `zoom-out`
```js
{ action: 'zoom-out' }
// Resets scale to 1, restores all widget opacities to 1
```

### `spotlight`
```js
{ action: 'spotlight', targetId: string }
// Adds radial gradient dark vignette around the target widget
// Does NOT zoom — cinematic focus without changing scale
```

### `despawn`
```js
{ action: 'despawn', id: string }
// Triggers despawn animation then removes widget from state
```

### `clear`
```js
{ action: 'clear' }
// Despawns ALL current widgets simultaneously
```

---

## WidgetRenderer Implementation Notes
- Use a `Map` keyed by widget `id` for O(1) lookups
- Keep a separate `despawning: Set<string>` for widgets mid-animation
- On `despawn`, add to set, run animation, then remove from both Map and set
- `arrow` widgets should re-render on every canvas resize to recompute center points
- Always render `arrow` widgets last (highest z-index) so lines draw on top
