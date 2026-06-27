# Animation Spec

Loaded when working on transitions, CSS, or canvas visual effects.
All durations in milliseconds. All easings in CSS cubic-bezier or keyword form.

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
| Batch spawn stagger | delay per widget | — | — | +50ms each | — |
| Email card stagger | delay per card | — | — | +200ms each | — |

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
When zooming to a target widget, compute the translate offset so the widget centers in the viewport.

---

## Project Switch Sequence

| Time | Event | Duration |
|---|---|---|
| 0ms | All widgets fade out simultaneously | 250ms |
| 0ms | Scan-line begins (top → bottom) | 400ms |
| 250ms | Canvas is empty | — |
| 300ms | Mic indicator pulse (scale 1→1.3→1) | 300ms |
| 450ms | New widgets spawn with 50ms stagger | 300ms each |
| 500ms | Project name label fades in | 600ms |

Scan-line: `1px` horizontal rule, `rgba(255,255,255,0.15)`, sweeps from `top:0` to `top:100%`, opacity fades to 0 as it reaches the bottom.

---

## Ticker

| Event | Property | Value | Duration | Easing |
|---|---|---|---|---|
| New sentence in | opacity | 0 → 1 | 150ms | ease-out |
| Sentence clear | opacity | 1 → 0 | 400ms | ease-in |
| Between sentences | gap | — | 100ms pause | — |

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
| Node glow (active) | box-shadow / filter | 0 → `0 0 6px rgba(255,255,255,0.6)` | 200ms |
| Canvas restore on click | all widgets | simultaneous fade swap | 250ms out + 300ms in |

---

## Arrow Widgets

| Event | Duration |
|---|---|
| Draw on spawn | stroke-dashoffset 100%→0, 400ms ease-out |
| Undraw on despawn | stroke-dashoffset 0→100%, 200ms ease-in |

---

## Particle Background

Runs permanently via `requestAnimationFrame`. Never use `setInterval`.

```js
// ~40 particles at any time
// Each: 3px circle, opacity 0.015–0.03, random position
// Velocity: random direction, speed 0.02–0.06 px/frame
// On out-of-bounds: wrap to opposite edge (not respawn)
// No acceleration, no color — pure white rgba(255,255,255,opacity)
```

Performance guard: skip particle update if `document.hidden === true`.

---

## CSS Custom Properties (design tokens)

```css
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
}
```
