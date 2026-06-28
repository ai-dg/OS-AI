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
- **Camera transforms** (pan, zoom, pan-zoom) are CSS transitions on the canvas wrapper div —
  NOT Framer Motion. They use `transition: transform 400ms ease-in-out` and are driven by
  `cameraOffsetX`, `cameraOffsetY`, `cameraZoomScale` from `canvasStore`.
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

## Camera System

The camera transform is applied to a single `.canvas-wrapper` div. All camera moves —
pan, zoom, pan-zoom — animate this one CSS property. The canvas wrapper must always have
`transition: transform 400ms ease-in-out` set.

```css
.canvas-wrapper {
  transition: transform 400ms ease-in-out;
  transform-origin: 0 0;   /* top-left, NOT center */
  will-change: transform;
}
```

The transform is computed from three store values:

```ts
// Applied in Canvas.tsx
const { cameraOffsetX, cameraOffsetY, cameraZoomScale } = useCanvasStore()
const transform = [
  `translate(${-cameraOffsetX * cameraZoomScale}px,`,
  `${-cameraOffsetY * cameraZoomScale}px)`,
  `scale(${cameraZoomScale})`,
].join(' ')
```

### Camera move timings

| Event | Duration | Easing | Notes |
|---|---|---|---|
| `pan-zoom` (AI narrative) | 400ms | ease-in-out | CSS transition on wrapper |
| `pan` (AI narrative) | 400ms | ease-in-out | same |
| `fit-all` | 500ms | ease-in-out | slightly slower — overview feel |
| `zoom` (focus on widget) | 400ms | ease-in-out | existing behaviour |
| User drag pan | 0ms (instant) | — | direct store mutation, no transition |
| User scroll zoom | 0ms (instant) | — | direct store mutation, no transition |
| `zoom-out` (restore from zoom) | 400ms | ease-in-out | existing |

**User navigation is always instant** — no animation for drag/scroll. This is intentional:
animated panning during user drag feels laggy. The CSS transition is only active during
AI-driven camera moves. Toggle it with a class:

```css
.canvas-wrapper.ai-camera { transition: transform 400ms ease-in-out; }
.canvas-wrapper              { transition: none; }
```

Set `ai-camera` class when processing a camera action from `converse.ts`/`demoStore`;
remove it immediately after the transition ends.

### Non-target widget opacity during zoom (existing behaviour, unchanged)

| Event | Property | Value | Duration | Easing |
|---|---|---|---|---|
| Zoom in | non-targets opacity | 1 → 0.2 | 400ms | ease-in-out |
| Zoom out | all widgets opacity | 0.2 → 1 | 400ms | ease-in-out |

Non-target dimming does NOT apply to `pan-zoom` or `pan` — all widgets stay at full
opacity during district transitions. Dimming is only for `zoom` (focus on single widget).

---

## Zoom System (existing, unchanged)

| Event | Property | Value | Duration | Easing |
|---|---|---|---|---|
| Zoom in | canvas transform | scale(N) + translate | 400ms | ease-in-out |
| Zoom in (non-targets) | opacity | 1 → 0.2 | 400ms | ease-in-out |
| Zoom out | canvas transform | scale(1) | 400ms | ease-in-out |
| Zoom out (all widgets) | opacity | 0.2 → 1 | 400ms | ease-in-out |
| Spotlight overlay | opacity | 0 → 1 | 300ms | ease-out |

---

## Camera Lock Visual (isAISpeaking)

When `isAISpeaking === true`, the canvas cursor changes:

```css
.canvas-wrapper.is-ai-speaking {
  cursor: default;   /* remove grab/pointer affordance */
}
```

No other lock indicator is shown. The AI is visibly speaking — no additional UI needed.

---

## Project Switch Sequence (unchanged)

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

## Reset Demo Flash (unchanged)

```css
.canvas-border-flash {
  position: absolute; inset: 0;
  border: 1px solid rgba(255,255,255,0.4);
  pointer-events: none;
  animation: border-flash 200ms ease-out forwards;
}
@keyframes border-flash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
```

---

## QCM Widget Animations (unchanged)

| Event | Property | Value | Duration |
|---|---|---|---|
| Option hover | border color | → `rgba(255,255,255,0.15)` | 150ms |
| Option select | bg + border | → purple tint | 200ms ease-out |
| Correct answer reveal | bg + border | → green | 300ms ease-out |
| Wrong answer reveal | bg + border | → red | 300ms ease-out |
| Progress bar fill (on enter) | width | 0 → value% | 800ms ease-out |
| Submit button appear | opacity + translateY | 0,+8px → 1,0 | 300ms ease-out |
| Question transition | translateX | +20px → 0 (in) | 200ms ease-in-out |

---

## Mail Compose Widget Animations (unchanged)

| Event | Property | Value | Duration |
|---|---|---|---|
| Send button click | button text | → `Sending…` + spinner | immediate |
| Spinner | transform | rotate 360° | 800ms linear infinite |
| Send success | button | → `✓` green | 200ms ease-out |
| Widget sent collapse | transform + opacity | scale(0.85) + opacity 0 | 600ms ease-in |

---

## Lesson Widget Animations (unchanged)

### Triangle draw (Beat 0)
```
stroke-dashoffset animation per segment: animationMs / 3 per segment, ease-out
After each segment: vertex dot fades in (100ms)
After all 3: right-angle marker draws (150ms)
```

### Side highlight (Beats 1–3)
```
Previous highlight fades out (200ms)
Targeted segment: stroke → glowColor (200ms ease-out)
SVG glow filter: blur(3px) duplicate, opacity 0→0.6 (300ms)
Label fade in: opacity 0→1 + translateX(-4px→0) (300ms ease-out)
```

### Equation reveal (Beat 4)
```
Triangle: opacity 1→0.4 (400ms ease-out)
Equation: each character types in, 60ms delay per char
Connector lines: stroke-dashoffset (400ms ease-out, 100ms stagger)
```

---

## Ticker (unchanged)

| Event | Property | Value | Duration | Easing |
|---|---|---|---|---|
| New sentence in | opacity | 0 → 1 | 150ms | ease-out |
| Character typewriter | — | 25ms per character | — | — |
| Sentence clear | opacity | 1 → 0 | 400ms | ease-in |

---

## Mic Indicator (unchanged)

| State | Animation |
|---|---|
| Idle | `scale(1.0) → scale(1.15)` breathing, 2000ms cycle |
| Listening | faster breathing: 800ms cycle |
| Processing | rotate border spinner, 1000ms linear infinite |
| Error | border turns `rgba(239,68,68,0.8)`, 200ms |

---

## Conversation Tree (unchanged)

| Event | Property | Value | Duration |
|---|---|---|---|
| New node appears | opacity | 0 → 1 | 200ms |
| New connecting line | stroke-dashoffset | 100% → 0 | 300ms |
| Node selected | scale | 1 → 1.2 | 150ms |
| Canvas restore on click | all widgets | fade swap | 250ms out + 300ms in |

---

## Design Tokens (unchanged)

```css
/* conceptual tokens — apply via Tailwind classes / inline style */
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
  --transition-camera: 400ms ease-in-out;   /* NEW — pan/pan-zoom */
  --transition-fit-all: 500ms ease-in-out;  /* NEW — fit-all overview */
  --transition-label: 600ms ease-out;
  --transition-lesson: 700ms ease-out;
}
```
