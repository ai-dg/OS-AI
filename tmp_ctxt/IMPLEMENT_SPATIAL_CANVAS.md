# Implement: Spatial Canvas — Virtual Infinite Canvas

## What this is

This task adds a **virtual infinite canvas** to JARVIS. The canvas currently maps 1:1 to the
viewport (widgets placed at x/y % of screen). After this change, the canvas is a **300×300 unit
virtual space** — the viewport is a camera flying over it. The AI builds new "districts" as
conversation grows (origin, right, below, etc.); the user can freely navigate when the AI is idle.

Read these docs before writing any code:
- `.claude/docs/SPATIAL_CANVAS.md` — canonical spec (coordinate system, regions, camera actions, lock)
- `.claude/docs/AI_CONTRACT.md` — updated canvas action schema incl. `pan-zoom`, `pan`, `fit-all`
- `.claude/docs/ANIMATIONS.md` — camera transition timings and CSS approach
- `.claude/docs/DEMO_SCRIPT.md` — two-agent demo model (feature registry, `onActivate`, `advanceGuided`)
- `CLAUDE.md` — updated architecture overview and canvasStore shape

---

## Implementation order

Build in this exact sequence. Each phase leaves the app in a working state.

---

### Phase 1 — canvasStore: add spatial camera fields

**File:** `src/store/canvasStore.ts`

Add these fields to the store state:

```ts
cameraOffsetX: number      // canvas units, default 0
cameraOffsetY: number      // canvas units, default 0
minZoomScale: number       // computed, default 0.5
isAISpeaking: boolean      // camera lock flag, default false
```

Add these actions:

```ts
panZoom: (target: { region?: string; x?: number; y?: number; scale?: number }) => void
panCamera: (dx: number, dy: number) => void
fitAll: () => void
```

**`panZoom` implementation:**
```ts
panZoom: (target) => {
  const coords = target.region
    ? resolveRegion(target.region)   // from layoutManager.ts
    : { x: target.x ?? 0, y: target.y ?? 0 }
  set({
    cameraOffsetX: coords.x,
    cameraOffsetY: coords.y,
    cameraZoomScale: target.scale ?? get().cameraZoomScale,
  })
},
```

**`panCamera` implementation:**
```ts
panCamera: (dx, dy) => {
  set(s => ({
    cameraOffsetX: s.cameraOffsetX + dx,
    cameraOffsetY: s.cameraOffsetY + dy,
  }))
},
```

**`fitAll` implementation:**
```ts
fitAll: () => {
  const { widgets } = get()
  const all = Object.values(widgets)
  const min = computeMinZoom(all)   // from layoutManager.ts
  set({
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    cameraZoomScale: min,
    minZoomScale: min,
  })
},
```

Also update `spawn` and `despawn` to call `computeMinZoom` and keep `minZoomScale` current:

```ts
spawn: (widget) => {
  set(s => {
    const next = { ...s.widgets, [widget.id]: widget }
    return {
      widgets: next,
      order: [...s.order, widget.id],
      minZoomScale: computeMinZoom(Object.values(next)),
    }
  })
},
```

Update `clear()` to also reset camera to origin:

```ts
clear: () => set({
  widgets: {},
  order: [],
  cameraOffsetX: 0,
  cameraOffsetY: 0,
  cameraZoomScale: 1.0,
  minZoomScale: 0.5,
  isAISpeaking: false,
  cameraMode: 'idle',
  cameraTargetId: null,
}),
```

---

### Phase 2 — layoutManager: spatial canvas utilities

**File:** `src/canvas/layoutManager.ts`

Add or update these exports:

```ts
// Named regions — matches SPATIAL_CANVAS.md
export const REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  origin:         { x: 5,   y: 5,   w: 90,  h: 69 },
  right:          { x: 110, y: 5,   w: 90,  h: 69 },
  'far-right':    { x: 215, y: 5,   w: 80,  h: 69 },
  below:          { x: 5,   y: 85,  w: 90,  h: 69 },
  'below-right':  { x: 110, y: 85,  w: 90,  h: 69 },
  'far-below':    { x: 5,   y: 170, w: 90,  h: 69 },
}

// Resolve a named region to its top-left origin coordinates
export function resolveRegion(region: string): { x: number; y: number } {
  const r = REGIONS[region] ?? REGIONS.origin
  return { x: r.x, y: r.y }
}

// Compute the minimum zoom scale to fit all widgets in the viewport
export function computeMinZoom(widgets: Widget[]): number {
  if (widgets.length === 0) return 0.5
  const maxX = Math.max(...widgets.map(w => w.x + w.w)) + 10
  const maxY = Math.max(...widgets.map(w => w.y + w.h)) + 10
  return Math.min(100 / maxX, 74 / maxY) * 0.9
}

// Updated clampToSafeZone — extended to 300-unit canvas
export function clampToSafeZone(
  x: number, y: number, w: number, h: number
): { x: number; y: number; w: number; h: number } {
  const cw = Math.min(Math.max(w, 5), 120)
  const ch = Math.min(Math.max(h, 5), 90)
  return {
    x: Math.min(Math.max(x, 0), 290 - cw),
    y: Math.min(Math.max(y, 0), 290 - ch),
    w: cw,
    h: ch,
  }
}
```

---

### Phase 3 — Canvas.tsx: apply transform + user navigation

**File:** `src/canvas/Canvas.tsx`

#### 3a. Compute and apply the camera transform

```tsx
const { cameraOffsetX, cameraOffsetY, cameraZoomScale, isAISpeaking } = useCanvasStore()

const transform = [
  `translate(${-cameraOffsetX * cameraZoomScale}px,`,
  `${-cameraOffsetY * cameraZoomScale}px)`,
  `scale(${cameraZoomScale})`,
].join(' ')
```

Apply to the canvas wrapper div. **Toggle a CSS class for animated vs instant transitions:**

```tsx
const [aiCameraActive, setAiCameraActive] = useState(false)

// When isAISpeaking transitions to false, we just finished an AI camera sequence.
// Remove the ai-camera class to switch back to instant user-navigation mode.
useEffect(() => {
  if (!isAISpeaking) setAiCameraActive(false)
}, [isAISpeaking])
```

In `playSyncResponse` / wherever camera actions are dispatched, set `aiCameraActive = true`
before issuing a `pan-zoom`, `pan`, or `fit-all` action, then let the CSS transition play.

Canvas wrapper div:
```tsx
<div
  ref={canvasWrapperRef}
  className={[
    'absolute inset-0',
    aiCameraActive ? 'ai-camera' : '',
    isAISpeaking ? 'is-ai-speaking' : '',
  ].join(' ')}
  style={{
    transform,
    transformOrigin: '0 0',
    willChange: 'transform',
  }}
>
```

In `index.css` (or a global CSS block), add:
```css
.ai-camera {
  transition: transform 400ms ease-in-out;
}
.is-ai-speaking {
  cursor: default;
}
```

#### 3b. User navigation (idle mode only)

Wire up drag-to-pan and scroll-to-zoom on the **outer** canvas container (the fixed
viewport div, not the transforming wrapper):

```tsx
const viewportRef = useRef<HTMLDivElement>(null)
const dragState = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null)

useEffect(() => {
  const el = viewportRef.current
  if (!el) return

  const onWheel = (e: WheelEvent) => {
    if (isAISpeakingRef.current) return   // use a ref to avoid stale closure
    e.preventDefault()
    const delta = -e.deltaY * 0.001
    const { cameraZoomScale, minZoomScale } = useCanvasStore.getState()
    const next = Math.min(Math.max(cameraZoomScale + delta, minZoomScale), 2.5)
    useCanvasStore.getState().set({ cameraZoomScale: next })
  }

  const onPointerDown = (e: PointerEvent) => {
    if (isAISpeakingRef.current) return
    if (e.button !== 0) return
    const { cameraOffsetX, cameraOffsetY } = useCanvasStore.getState()
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffX: cameraOffsetX, startOffY: cameraOffsetY }
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState.current || isAISpeakingRef.current) return
    const { cameraZoomScale } = useCanvasStore.getState()
    const dx = (e.clientX - dragState.current.startX) / cameraZoomScale
    const dy = (e.clientY - dragState.current.startY) / cameraZoomScale
    useCanvasStore.getState().set({
      cameraOffsetX: dragState.current.startOffX - dx,
      cameraOffsetY: dragState.current.startOffY - dy,
    })
  }

  const onPointerUp = () => {
    dragState.current = null
    el.style.cursor = isAISpeakingRef.current ? 'default' : 'grab'
  }

  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)

  return () => {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
  }
}, [])   // stable — uses refs + getState() to avoid stale closures
```

**Use `isAISpeakingRef` (a ref synced to the store value) inside event handlers** to avoid
stale closure bugs — `useRef` updated in a `useEffect` watching `isAISpeaking`.

Default cursor on the viewport div: `cursor: grab` (when not speaking).

#### 3c. Keyboard shortcuts (add to existing keyboard handler in Canvas.tsx)

```ts
case 'Digit0':
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    useCanvasStore.getState().fitAll()
  }
  break
case 'Equal':   // Cmd+= / Ctrl+=
  if (e.metaKey || e.ctrlKey) {
    const { cameraZoomScale } = useCanvasStore.getState()
    useCanvasStore.getState().set({ cameraZoomScale: Math.min(cameraZoomScale + 0.1, 2.5) })
  }
  break
case 'Minus':   // Cmd+- / Ctrl+-
  if (e.metaKey || e.ctrlKey) {
    const { cameraZoomScale, minZoomScale } = useCanvasStore.getState()
    useCanvasStore.getState().set({ cameraZoomScale: Math.max(cameraZoomScale - 0.1, minZoomScale) })
  }
  break
```

---

### Phase 4 — converse.ts / orchestrate.ts: handle new camera actions + lock

**File:** `src/ai/converse.ts`

#### 4a. Camera lock/unlock

Wrap the entire `streamText` + sync playback in:

```ts
useCanvasStore.getState().set({ isAISpeaking: true })
try {
  // ... existing streaming and sync playback ...
} finally {
  useCanvasStore.getState().set({ isAISpeaking: false })
}
```

#### 4b. Handle new canvas actions in `playSyncResponse`

In the section that processes each `canvas[i]` action, add cases for the new actions:

```ts
case 'pan-zoom': {
  // Signal Canvas.tsx to enable animated transition for this move
  // (simplest: set a flag on the store that Canvas.tsx watches)
  store.panZoom({
    region: action.region,
    x: action.x,
    y: action.y,
    scale: action.scale,
  })
  break
}
case 'pan': {
  store.panCamera(action.dx ?? 0, action.dy ?? 0)
  break
}
case 'fit-all': {
  store.fitAll()
  break
}
```

**Also add to `SYNC_TYPE_MAP`** — these are camera actions, not widget types, so no type mapping
needed. Just ensure the action dispatcher handles them before falling through to the widget spawn
path.

**File:** `src/ai/orchestrate.ts`

Add the same three action cases to `dispatchCameraAction()` (or wherever the secondary formats
handle camera commands).

---

### Phase 5 — systemPrompt.ts: spatial canvas guidance

**File:** `src/ai/systemPrompt.ts`

In `buildSystemPrompt()`, add the following section to the system prompt string. Insert it
**after** the widget catalog and **before** the project context injection:

```
## SPATIAL CANVAS

The canvas is a virtual 300×300 unit space. The initial viewport shows x: 0–100, y: 0–74.
You can place widgets beyond x: 100 or y: 74 to create new off-screen districts.
The camera will pan-zoom to reveal them as part of your narrative.

### Named regions — use these in pan-zoom actions
- origin:       x: 5–95,   y: 5–70   → first response or reset
- right:        x: 110–190, y: 5–70   → follow-up on same topic
- far-right:    x: 215–285, y: 5–70   → third distinct topic / comparison
- below:        x: 5–95,   y: 85–150  → deeper dive / step 2
- below-right:  x: 110–190, y: 85–150 → cross-reference

### Camera rules (FOLLOW THESE EXACTLY)
1. canvas[0] is ALWAYS an orientation action. Never a bare spawn.
   - New topic or reset: { "action": "despawn", "id": "*" } then { "action": "pan-zoom", "region": "origin" }
   - Follow-up in new district: { "action": "pan-zoom", "region": "right" } (no despawn)
2. New topic → despawn "*" first, then pan-zoom to origin.
3. Follow-up / continuation → pan-zoom to right or below WITHOUT despawning.
4. Summarising across multiple districts → end with { "action": "fit-all" }
5. Per-turn area budget: max ~81 square units of widgets per response. Prefer fewer, richer widgets.

### Widget coordinate reminder
- Within origin (x: 0–100, y: 0–74): same as before — no change.
- Right district: x starts at 110. Example: x: 112, y: 10, w: 38, h: 50.
- y + h ≤ 74 within each 100-unit vertical band (bottom 26 reserved for system UI).
- Never place a widget beyond x: 290 or y: 290.

### Example — follow-up response (do NOT clear, expand to right district)
{
  "speech": "Let me add some context.|Here's the first point.|And the second.",
  "canvas": [
    { "action": "pan-zoom", "region": "right", "scale": 1.0 },
    { "action": "spawn", "type": "text-block", "id": "point-1", "x": 112, "y": 8, "w": 38, "h": 40, "data": { "title": "First point", "body": "..." } },
    { "action": "spawn", "type": "text-block", "id": "point-2", "x": 155, "y": 8, "w": 38, "h": 40, "data": { "title": "Second point", "body": "..." } }
  ]
}

### Example — new topic (clear and return to origin)
{
  "speech": "Sure, let me start fresh.|Here is the overview.",
  "canvas": [
    { "action": "despawn", "id": "*" },
    { "action": "pan-zoom", "region": "origin", "scale": 1.0 },
    { "action": "spawn", "type": "text-block", "id": "overview", "x": 10, "y": 10, "w": 80, "h": 50, "data": { "title": "Overview", "body": "..." } }
  ]
}
```

---

### Phase 6 — demoStore.ts: lock during scripted feature activations

**File:** `src/store/demoStore.ts`

The demo now uses a **feature registry** — each feature has an `onActivate(params)` function
(not `onEnter`). The step-counter model (`currentStep`, `advance()`) no longer exists; progress
is `completed: Set<string>` owned by the Progress Tracker.

In each feature's `onActivate()`, wrap canvas operations with the camera lock:

```ts
// Feature registry entry shape
features: {
  'todo-overview': {
    onActivate: (_params) => {
      useCanvasStore.getState().set({ isAISpeaking: true })
      useCanvasStore.getState().clear()
      // ... spawn widgets, play ticker ...
      // After all animations complete (longest spawn stagger + 100ms buffer):
      setTimeout(() => {
        useCanvasStore.getState().set({ isAISpeaking: false })
      }, STEP_ANIMATION_DURATION_MS + 100)
    }
  },
  // ... other features (qcm, lesson, mail-compose, project-switch) same pattern
}
```

For the demo, `STEP_ANIMATION_DURATION_MS` is typically 600–1000ms (widget spawns + stagger).
Use 1200ms as a safe default for features with multiple spawns.

`demoStore.reset()` calls `useCanvasStore.getState().clear()` which now resets all camera
fields including `isAISpeaking` — no additional reset needed.

> **Two-agent note:** `onActivate` only spawns widgets and locks/unlocks the camera. Marking
> demo steps complete is done by `progressTracker.ts` (Agent 2) — `onActivate` emits an
> activation event; the Tracker observes it and calls `demoStore.markCompleted([...])`.
> Never set completion inside `onActivate` directly.

---

### Phase 7 — DemoControls: fit-all button (optional quality-of-life)

**File:** `src/components/DemoControls.tsx`

Add a small `⊡ Fit` button next to the Reset Demo button (top-right area):

```tsx
<button
  onClick={() => useCanvasStore.getState().fitAll()}
  className="fit-all-btn"
  title="Fit all content in view (Cmd+0)"
>
  ⊡
</button>
```

Style: same aesthetic as Reset Demo but smaller. Only shows when there are widgets outside
the initial viewport (i.e., when `minZoomScale < 0.9`).

---

## What NOT to change

- The demo's scripted steps all use origin-region coordinates (x: 0–100, y: 0–74). Do not
  move them. They work identically in the new coordinate system.
- `demoStore.reset()` → `canvasStore.clear()` already resets camera. No other reset needed.
- Widget renderers in `registry.tsx` are position-agnostic — no changes needed there.
- The `y + h ≤ 74` rule in the existing system prompt stays for origin-region widgets.
  It is now clarified as "per 100-unit vertical band" in the spatial canvas guidance.

---

## Verification checklist

- [ ] `npm run typecheck` passes with no errors
- [ ] Reset Demo → black canvas, camera at origin (0,0), scale 1.0, `isAISpeaking: false`
- [ ] Ask a question → `isAISpeaking` locks during response, unlocks after speech finishes
- [ ] Drag to pan while AI is speaking → no movement (lock works)
- [ ] Scroll to zoom while AI idle → camera moves instantly (no transition)
- [ ] AI issues `pan-zoom { region: "right" }` → camera animates to x:110 smoothly (400ms)
- [ ] AI issues `fit-all` → camera zooms out to show all widgets
- [ ] `Cmd+0` → fit all in view
- [ ] Widgets placed at x:112 render correctly off-screen right, revealed by pan-zoom
- [ ] All 4 demo features (`todo-overview`, `qcm`, `lesson`, `mail-compose`) still activate correctly — no visual regression
- [ ] `demoStore.reset()` → completion set cleared, camera at origin (0,0), `isAISpeaking: false`
- [ ] Simulate-Voice button (`advanceGuided`) still cycles through uncompleted features in canonical order
- [ ] `minZoomScale` never allows zooming out further than "see the whole city"
