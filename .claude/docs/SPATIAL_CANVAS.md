# Spatial Canvas — Virtual Infinite Canvas Spec

Loaded when working in `src/store/canvasStore.ts`, `src/canvas/Canvas.tsx`,
`src/canvas/layoutManager.ts`, or `src/ai/systemPrompt.ts`.

## Concept

The canvas is a **virtual coordinate space** larger than the viewport. The viewport is a camera
flying over it. The AI is the architect who builds new districts as the conversation grows.
Users can freely navigate when the AI is idle; the AI locks the camera and drives it as
narrative during speech.

Think of it as a **city**: origin district is where conversations begin, new districts grow
rightward and downward as topics expand. The user can always zoom out to see the whole city.

---

## Coordinate System

```
Virtual canvas: 300 × 300 units (hard maximum)
Initial viewport: x: 0–100, y: 0–74 (bottom 26 reserved for system UI — same as before)

1 canvas unit = 1 viewport percent at zoom 1.0
```

Widget `x, y, w, h` are **canvas units** (plain numbers, no `%`). They work identically to the
old viewport-percent system within `0–100`, and extend beyond it for off-screen content.

**Hard limits enforced by `layoutManager.ts`:**
- `x` clamp: `0 – 290` (widget + width must not exceed 300)
- `y` clamp: `0 – 290`
- No single widget wider than `120 units` or taller than `90 units`
- Total canvas area of all widgets spawned in one turn: ≤ `9 × 9 = 81 square units` (AI
  constraint, enforced via system prompt guidance, not hard-coded — the layout manager warns
  but does not reject)

---

## Named Regions

The AI references these named regions in `pan-zoom` actions. The layout manager resolves them
to canvas unit coordinates.

```ts
const REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  origin:       { x: 5,   y: 5,   w: 90,  h: 69 },  // initial viewport
  right:        { x: 110, y: 5,   w: 90,  h: 69 },  // first follow-up, same row
  'far-right':  { x: 215, y: 5,   w: 80,  h: 69 },  // third topic
  below:        { x: 5,   y: 85,  w: 90,  h: 69 },  // deeper dive / step 2
  'below-right':{ x: 110, y: 85,  w: 90,  h: 69 },  // cross-reference
  'far-below':  { x: 5,   y: 170, w: 90,  h: 69 },  // extended exploration
}
```

The AI should pick the region that best fits the content's relationship to what came before:
- **Same topic, more detail** → `below`
- **New parallel topic** → `right`
- **Third distinct topic / comparison** → `far-right`
- **Correction or cross-reference** → `below-right`
- **Start of new conversation turn (after idle)** → `origin` (cleared first)

---

## Camera Model

### State (added to `canvasStore`)

```ts
// New fields in canvasStore
cameraOffsetX: number     // canvas units, default 0
cameraOffsetY: number     // canvas units, default 0
cameraZoomScale: number   // existing, default 1.0
isAISpeaking: boolean     // LOCK FLAG — true during converse() speech/canvas sync
minZoomScale: number      // computed by fit-all, updated whenever widgets change
```

### CSS Transform

Applied to the canvas wrapper div:

```ts
// Canvas.tsx — transform applied to the canvas wrapper
const transform = `
  translate(${-cameraOffsetX * cameraZoomScale}px, ${-cameraOffsetY * cameraZoomScale}px)
  scale(${cameraZoomScale})
`
// transform-origin: 0 0 (top-left of viewport, not center)
```

### Zoom Bounds

```ts
const MIN_ZOOM = minZoomScale   // computed: viewport / bounding box of all widgets (with padding)
const MAX_ZOOM = 2.5            // never zoom in more than 2.5× the natural size
```

`minZoomScale` is recalculated after every `spawn` / `despawn` / `clear` by `computeMinZoom()`:

```ts
function computeMinZoom(widgets: Widget[]): number {
  if (widgets.length === 0) return 0.5
  const maxX = Math.max(...widgets.map(w => w.x + w.w)) + 10
  const maxY = Math.max(...widgets.map(w => w.y + w.h)) + 10
  // Scale that fits the entire bounding box in the viewport with 5% padding
  return Math.min(100 / maxX, 74 / maxY) * 0.9
}
```

---

## Camera Actions (AI-issued, in `canvas` array)

These extend the existing action set in `AI_CONTRACT.md`. New actions are handled in
`converse.ts` / `orchestrate.ts` alongside existing `spawn` / `despawn` / `zoom`.

### `pan-zoom` (primary narrative action)
Move the camera to a named region or explicit coordinates, optionally with a zoom scale.

```json
{ "action": "pan-zoom", "region": "right", "scale": 1.0 }
{ "action": "pan-zoom", "x": 110, "y": 5, "scale": 1.2 }
```

Implementation in `canvasStore`:
```ts
panZoom(target: { region?: string; x?: number; y?: number; scale?: number }) {
  const coords = target.region ? REGIONS[target.region] : target
  set({
    cameraOffsetX: coords.x,
    cameraOffsetY: coords.y,
    cameraZoomScale: target.scale ?? 1.0,
  })
}
```
Animation: `400ms ease-in-out` on the canvas wrapper transform (CSS transition).

### `pan` (relative move)
Translate the camera by delta without changing zoom.

```json
{ "action": "pan", "dx": 105, "dy": 0 }
```

### `fit-all` (overview)
Zoom out to show all spawned widgets. Sets camera to `(0, 0)` and `minZoomScale`.

```json
{ "action": "fit-all" }
```

Used at the start of a summary or when the AI wants to reference multiple districts.

### `zoom` (existing — unchanged)
Focus on a specific widget id. Keeps existing semantics.

```json
{ "action": "zoom", "targetId": "widget-id", "scale": 1.5 }
```

---

## User Navigation (idle mode only)

When `isAISpeaking === false`, the canvas wrapper listens for:

**Mouse/trackpad wheel** → zoom:
```ts
canvas.addEventListener('wheel', (e) => {
  if (isAISpeaking) return   // LOCK
  e.preventDefault()
  const delta = -e.deltaY * 0.001
  const newScale = clamp(cameraZoomScale + delta, minZoomScale, MAX_ZOOM)
  set({ cameraZoomScale: newScale })
}, { passive: false })
```

**Pointer drag** → pan:
```ts
canvas.addEventListener('pointerdown', startDrag)
// on pointermove: translate cameraOffsetX/Y by (dx / cameraZoomScale)
// clamp to keep city in view — never pan so far that all widgets are off-screen
```

**Keyboard shortcuts:**
- `Cmd+0` / `Ctrl+0` → `fit-all` (see current state of city)
- `Cmd+=` / `Ctrl+=` → zoom in 0.1
- `Cmd+-` / `Ctrl+-` → zoom out 0.1

---

## Lock Behaviour

During `isAISpeaking === true`:

- `wheel` and `pointerdown` events on the canvas are ignored (early return)
- Canvas wrapper cursor: `default` (not `grab`) — no visual affordance for dragging
- No explicit "locked" UI indicator needed — the AI is visibly speaking/animating

The lock is set and cleared in `converse.ts`:
```ts
// converse.ts
async function converse(...) {
  useCanvasStore.getState().set({ isAISpeaking: true })
  // ... streaming + sync playback ...
  useCanvasStore.getState().set({ isAISpeaking: false })
}
```

For scripted demo steps (demoStore), the lock is set manually around the playback:
```ts
// demoStore.ts — in onEnter() of each step
useCanvasStore.getState().set({ isAISpeaking: true })
// ... spawn widgets, play ticker ...
// After all animations complete:
useCanvasStore.getState().set({ isAISpeaking: false })
```

---

## AI Placement Rules (system prompt guidance)

The AI must follow these rules when choosing coordinates for new widgets:

1. **First response of a new topic**: always start in `origin` region (after `despawn "*"`).
   Issue `pan-zoom { region: "origin" }` as `canvas[0]`.

2. **Follow-up on the same topic**: place widgets starting at `x: 110` (right district).
   Issue `pan-zoom { region: "right" }` before spawning.

3. **Never overlap existing widgets**: the AI should track what it has already placed in the
   conversation and avoid placing new widgets on top of them.

4. **First canvas action is always orientation**: for any multi-widget response, `canvas[0]`
   is either `despawn "*"` (if clearing) or `pan-zoom` (if moving to a new district).
   `canvas[0]` is never a `spawn`.

5. **Fit-all before summary**: when the speech references multiple previously-placed widget
   groups, issue `fit-all` so the user sees the whole picture.

6. **Per-turn area budget**: place at most ~81 square units of widgets per turn (a rough
   3×3 cluster of medium widgets). Prefer depth (a few well-spaced widgets) over breadth.

---

## Layout Manager Updates

`src/canvas/layoutManager.ts` gains:

```ts
// Existing: clampToSafeZone() — updated bounds
export function clampToSafeZone(x: number, y: number, w: number, h: number) {
  return {
    x: clamp(x, 0, 290 - w),
    y: clamp(y, 0, 290 - h),
    w: clamp(w, 5, 120),
    h: clamp(h, 5, 90),
  }
}

// New: resolve named region to canvas coords
export function resolveRegion(region: string): { x: number; y: number } {
  return REGIONS[region] ?? REGIONS.origin
}

// New: compute min zoom from current widget set
export function computeMinZoom(widgets: Widget[]): number { ... }

// New: check if a widget placement overlaps any existing widget
export function hasOverlap(candidate: Widget, existing: Widget[]): boolean { ... }
```

---

## Backwards Compatibility

All existing widget placements in `x: 0–100, y: 0–74` continue to work identically — they are
simply in the `origin` region. No migration needed. The new coordinate space is a strict superset.

The only breaking change: `y + h ≤ 74` rule (AI constraint) now applies **per-region** — within
each 100-unit tall region, the bottom 26 units are reserved for system UI projection. In practice
this means the effective height per region remains 74 units, exactly as before.

---

## Demo Notes

For the **school demo**, all scripted steps place widgets in the `origin` region (they clear and
rebuild each time). The spatial canvas expansion is for **live free-form** conversation after the
scripted demo ends. The demo's `Reset Demo` wipes all districts back to a clean origin.

The `fit-all` action is most useful after the scripted demo, when the user has explored
multiple topics and wants to see the full canvas history.
