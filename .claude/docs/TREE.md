# Conversation Tree Spec

Loaded when working in `src/tree/`.

## Concept
The conversation tree is a **visual history of the session** rendered as an SVG node graph in a fixed strip at the bottom of the canvas. Each conversation turn creates a node. Clicking a node restores the canvas state from that moment.

Think of it as Git for context: every node is a commit, every branch is a diverging conversation path.

---

## Layout
```
Position:  fixed, bottom: 0, left: 0, right: 0
Height:    80px
BG:        rgba(0, 0, 0, 0.6)
Backdrop:  blur(8px)
Z-index:   100 (above canvas, below ticker)
```

The tree renders as an SVG that fills the strip. Nodes are circles, lines connect parent → child.

---

## TreeNode Shape
```js
{
  id: string,              // unique e.g. 'node-1720000000000'
  parentId: string | null, // null for root node
  timestamp: number,       // Date.now()
  canvasSnapshot: Widget[],// deep copy of canvas widgets at this moment
  speechSummary: string,   // first 40 chars of Claude's speech for tooltip
  isActive: boolean,
}
```

---

## Node Visuals
```
Diameter:   16px
Border:     1px solid rgba(255,255,255,0.3)
BG:         rgba(255,255,255,0.05)
Active:     border: rgba(255,255,255,0.9), box-shadow: 0 0 6px rgba(255,255,255,0.5)
Hover:      border: rgba(255,255,255,0.6), cursor: pointer
Connector:  1px line, rgba(255,255,255,0.2)
```

On hover: show tooltip above node with `speechSummary`.

---

## Layout Algorithm
Simple horizontal layout for demo purposes (no dagre needed):
- Root node at left center of the strip
- Each subsequent node is `+60px` to the right
- Branching: child nodes offset `+/-16px` vertically from parent's y
- If nodes would overflow right edge, scroll the strip horizontally (no wrap)

```
[○]──[○]──[○]──[○]──[○]
               └──[○]   ← branch when user changes topic
```

---

## Creating a Node
After every completed Claude response:
```js
const node = {
  id: `node-${Date.now()}`,
  parentId: project.activeNodeId,
  timestamp: Date.now(),
  canvasSnapshot: deepClone(project.canvasState),  // snapshot AFTER widgets render
  speechSummary: speech.slice(0, 40) + (speech.length > 40 ? '…' : ''),
  isActive: true,
}
project.tree.push(node)
// Deactivate previous active node
project.tree.forEach(n => n.isActive = n.id === node.id)
project.activeNodeId = node.id
```

---

## Restoring a Node
On node click:
```js
function restoreNode(node) {
  // 1. Fade out all current widgets (250ms)
  // 2. After 250ms: replace canvasState with node.canvasSnapshot
  // 3. Spawn all widgets from snapshot with 50ms stagger
  // 4. Mark this node as active
  // 5. Truncate history to this point? No — keep full history, just restore visual state
  project.activeNodeId = node.id
}
```

**Important:** Restoring a node only restores the **canvas visual state**. It does NOT truncate the conversation history — the agent still has full context.

---

## Implementation Notes
- Use `useRef` for the SVG element and compute positions after mount
- Re-render the tree on every new node (lightweight — just SVG circles and lines)
- `deepClone` canvas snapshots with `JSON.parse(JSON.stringify(...))` — widgets are plain objects
- The tree strip should NOT receive pointer events outside node circles (use `pointer-events: none` on the SVG background)
- On project switch, the tree rerenders for the new project's tree array
