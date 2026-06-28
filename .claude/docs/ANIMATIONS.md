# Animation Spec

Loaded when working on transitions, CSS, or canvas visual effects.
All durations in milliseconds. All easings in CSS cubic-bezier or keyword form.

## Stack note (how these are implemented)
- **Framer Motion v11** drives widget spawn/stagger/bar-fill animations: `motion.*` with
  `initial`/`animate`/`transition={{ duration, delay, ease: "easeOut" }}`. Convert the ms
  durations below to seconds for Framer (`300ms` → `duration: 0.3`). See `widgets/registry.tsx`
  for live examples (`BulletsWidget` stagger, `ProgressBarWidget` fill).
- **Tailwind v4** utility classes handle hover/colour transitions and static styling. Use inline
  `style={{…}}` only for dynamic values (computed width %, data-driven colours).
- The values in this spec are the **targets**; match them whether you reach for Framer Motion or
  a Tailwind/CSS transition.

## Golden Rule
**Every animation is 300ms ease-out** unless explicitly overridden below.
Never use `linear`. Never exceed 500ms for interactive feedback.

---

## Widget Lifecycle

| Event | Property | From | To | Duration | Easing |
|---|---|---|---|---|---|
| Spawn | opacity | 0 | 1 | 300ms | ease-out |
| Spawn | transform | scale(0.95) | scale(1) | 300ms | ease-out |
| Despawn | opacity | 1 | 0 | 200ms | ease-in |
| Despawn | transform | scale(1) | scale(0.95) | 200ms | ease-in |
| Batch spawn stagger | delay per widget | — | — | +80ms each | — |
| Email card stagger | delay per card | — | — | +200ms each | — |
| Task card stagger (Step 1) | delay per card | — | — | +80ms each | — |

---

## Zoom System

| Event | Property | Value | Duration | Easing |
|---|---|---|---|---|
| Zoom in | canvas transform | scale(N) + translate | 400ms | ease-in-out |
| Zoom in (non-targets) | opacity | 1 → 0.2 | 400ms | ease-in-out |
| Zoom out | canvas transform | scale(1) | 400ms | ease-in-out |
| Zoom out (all widgets) | opacity | 0.2 → 1 | 400ms | ease-in-out |
| Spotlight overlay | opacity | 0 → 1 | 300ms | ease-out |

Zoom is applied via `transform` on the **canvas wrapper**, not individual widgets:
```css
.canvas-wrapper {
  transition: transform 400ms ease-in-out;
  transform-origin: center center;
}
```

---

## Project Switch Sequence

| Time | Event | Duration |
|---|---|---|
| 0ms | All widgets fade out simultaneously | 250ms |
| 0ms | Scan-line begins (top → bottom) | 400ms |
| 250ms | Canvas is empty | — |
| 300ms | Mic indicator pulse (scale 1→1.3→1) | 300ms |
| 450ms | New widgets spawn with 80ms stagger | 300ms each |
| 500ms | Project name label fades in | 600ms |

Scan-line CSS:
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

## Reset Demo Flash

On `Reset Demo` click, a brief white edge flash confirms the reset:
```css
.canvas-border-flash {
  position: absolute; inset: 0;
  border: 1px solid rgba(255,255,255,0.4);
  border-radius: 0;
  pointer-events: none;
  animation: border-flash 200ms ease-out forwards;
}
@keyframes border-flash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
```
Add this element on reset click, remove after animation completes.

---

## QCM Widget Animations

| Event | Property | Value | Duration |
|---|---|---|---|
| Option hover | border color | → `rgba(255,255,255,0.15)` | 150ms |
| Option select | bg + border | → purple tint | 200ms ease-out |
| Correct answer reveal | bg + border | → green `rgba(52,211,153,0.15)` / `#34d399` | 300ms ease-out |
| Wrong answer reveal | bg + border | → red `rgba(239,68,68,0.15)` / `#ef4444` | 300ms ease-out |
| Correct reveal (if wrong chosen) | both answer rows animate | — | 300ms, +100ms stagger |
| Progress bar fill (on enter) | width | 0 → value% | 800ms ease-out |
| Submit button appear | opacity + translateY | 0,+8px → 1,0 | 300ms ease-out |
| Question transition (Next/Prev) | translateX | +20px → 0 (in), 0 → -20px (out) | 200ms ease-in-out |

---

## Mail Compose Widget Animations

| Event | Property | Value | Duration |
|---|---|---|---|
| Send button click | button text | → `Sending…` + spinner | immediate |
| Spinner | transform | rotate 360° | 800ms linear infinite |
| Send success | button | → `✓` green, opacity 1 | 200ms ease-out |
| Widget sent collapse | transform + opacity | scale(0.85) + opacity 0 | 600ms ease-in |
| QCM attachment card shrink | width + transform | → 30% original, slide left | 400ms ease-in-out |

QCM → attachment card transition (Step 3a):
```css
/* QCM widget transitions from full size to mini attachment card */
.qcm-widget.shrinking {
  transition: all 400ms ease-in-out;
  transform: scale(0.3) translateX(-60%);
  opacity: 0.7;
  border: 1px solid rgba(99,102,241,0.4);
}
```
After transition, swap the widget for a small `attachment-card` div inside the mail-compose widget.

---

## Lesson Widget Animations (SVG Drawing)

### Triangle draw (Beat 0)
```
Each of the 3 sides draws itself via stroke-dashoffset:
  stroke-dasharray: {segmentLength}
  stroke-dashoffset: {segmentLength} → 0
  duration: animationMs / 3 per segment (sequential, not parallel)
  easing: ease-out
After each segment: vertex dot fades in (100ms)
After all 3: right-angle marker square draws (150ms)
```

### Side highlight (Beats 1–3)
```
Previous highlight fades out (if any): stroke returns to default white (200ms)
Targeted segment: stroke changes to glowColor (200ms ease-out)
SVG filter glow: duplicate path behind with blur(3px) same color, opacity 0→0.6 (300ms)
Label fade in: opacity 0→1 + translateX(-4px → 0) (300ms ease-out, 100ms after stroke change)
```

### Equation reveal (Beat 4)
```
Triangle: opacity 1→0.4 (400ms ease-out) — steps back to give equation space
Equation container: fade in (300ms ease-out)
Each character types in with 60ms delay between chars
After last char: 400ms pause
Connector lines draw via stroke-dashoffset (400ms ease-out, 100ms stagger per connector)
Connectors: dashed line, rgba(255,255,255,0.25), from equation char to triangle label
```

### "OK?" prompt
```
Appears after instruction text completes (200ms delay)
Pulse animation: opacity 0.5 ↔ 1.0, 1500ms ease-in-out, infinite
On click/confirm: opacity 0 (150ms), then next beat starts
```

---

## Ticker

| Event | Property | Value | Duration | Easing |
|---|---|---|---|---|
| New sentence in | opacity | 0 → 1 | 150ms | ease-out |
| Character typewriter | — | 25ms per character | — | — |
| Sentence clear | opacity | 1 → 0 | 400ms | ease-in |
| Between sentences | pause | 1500ms hold | — | — |

---

## Mic Indicator

| State | Animation |
|---|---|
| Idle | `scale(1.0) → scale(1.15)` breathing, 2000ms cycle, ease-in-out, infinite |
| Listening (active) | faster breathing: 800ms cycle, slightly brighter border |
| Processing | stop breathing, rotate border (spinner), 1000ms linear infinite |
| Error | border turns `rgba(239,68,68,0.8)`, 200ms |

---

## Conversation Tree

| Event | Property | Value | Duration |
|---|---|---|---|
| New node appears | opacity | 0 → 1 | 200ms |
| New connecting line | stroke-dashoffset | 100% → 0 | 300ms |
| Node selected | scale | 1 → 1.2 | 150ms |
| Node glow (active) | filter | 0 → `drop-shadow(0 0 4px rgba(255,255,255,0.5))` | 200ms |
| Canvas restore on click | all widgets | simultaneous fade swap | 250ms out + 300ms in |

---

## Arrow Widgets

| Event | Duration |
|---|---|
| Draw on spawn | stroke-dashoffset 100%→0, 400ms ease-out |
| Undraw on despawn | stroke-dashoffset 0→100%, 200ms ease-in |

---

## Canvas Background

The shipped background is a **static CSS dot grid** — `.canvas-bg` in `index.css`
(`radial-gradient` 1px dots at 3% white, 32px grid). Cheap, always-on, no JS. Keep this as the
default.

Optional enhancement — animated particles (only if it stays at 60fps):
```js
// Drive via requestAnimationFrame — never setInterval.
// ~40 particles, 3px circle, opacity 0.015–0.03, random position
// Velocity: random direction, speed 0.02–0.06 px/frame; wrap on out-of-bounds
// Pure white rgba(255,255,255,opacity); no acceleration, no colour
// Performance guard: skip update if document.hidden === true
```

---

## Design tokens

These are the canonical values. In code they are expressed as **Tailwind utilities** (the zinc
palette + `font-mono`) and inline `style` for the accent colours — not a `:root` block (the only
global CSS is `@import "tailwindcss"` + `.canvas-bg` in `index.css`). Reference values:

```css
/* conceptual tokens — apply via Tailwind classes / inline style, not a literal :root */
:root {
  --canvas-bg: #080808;
  --widget-bg: rgba(255, 255, 255, 0.05);
  --widget-border: rgba(255, 255, 255, 0.08);
  --widget-border-hover: rgba(255, 255, 255, 0.15);
  --text-primary: rgba(255, 255, 255, 0.92);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-muted: rgba(255, 255, 255, 0.25);
  --accent-purple: #6366f1;
  --accent-green: #34d399;
  --accent-amber: #f59e0b;
  --accent-red: #ef4444;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --transition-fast: 200ms ease-in;
  --transition-base: 300ms ease-out;
  --transition-zoom: 400ms ease-in-out;
  --transition-label: 600ms ease-out;
  --transition-lesson: 700ms ease-out;
}
```
