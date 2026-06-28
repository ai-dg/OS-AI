import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTreeStore, type TreeNode } from "@/store/treeStore";
import { useCanvasStore } from "@/store/canvasStore";

// ── Strip geometry ─────────────────────────────────────────────────────────────

const STRIP_H   = 80;
const MAX_BAR_W = 480;
const MARGIN_L  = 52;   // px from strip left to first node centre
const NODE_GAP  = 88;   // px between adjacent node centres
const NODE_R    = 8;    // node radius → 16px diameter
const ROW_Y     = [30, 56] as const; // y-centre (px) for row 0 and row 1

// ── DFS layout ────────────────────────────────────────────────────────────────
// Assigns each node a (col, row). First child stays on same row; subsequent
// children (forks) increment the row. Col increments monotonically via DFS,
// ensuring every node is to the right of its parent.

interface NodePos { col: number; row: number }

function buildLayout(
  nodes: Record<string, TreeNode>,
  rootId: string | null,
): Record<string, NodePos> {
  const out: Record<string, NodePos> = {};
  if (!rootId || !nodes[rootId]) return out;
  let col = 0;

  function dfs(id: string, row: number) {
    const node = nodes[id];
    if (!node) return;
    out[id] = { col: col++, row };
    node.childIds.forEach((cid, i) => dfs(cid, row + (i > 0 ? 1 : 0)));
  }
  dfs(rootId, 0);
  return out;
}

function toXY(pos: NodePos) {
  return {
    x: MARGIN_L + pos.col * NODE_GAP,
    y: ROW_Y[Math.min(pos.row, 1)],
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConversationTree() {
  const nodes     = useTreeStore((s) => s.nodes);
  const rootId    = useTreeStore((s) => s.rootId);
  const currentId = useTreeStore((s) => s.currentId);
  const goTo      = useTreeStore((s) => s.goTo);
  const canvasClear   = useCanvasStore((s) => s.clear);
  const canvasRestore = useCanvasStore((s) => s.restore);

  const [navigating, setNavigating] = useState(false);
  const [popupOpen,  setPopupOpen]  = useState(false);
  const popupContainerRef = useRef<HTMLDivElement>(null);

  const layout   = useMemo(() => buildLayout(nodes, rootId), [nodes, rootId]);
  const nodeList = useMemo(
    () => Object.values(nodes).sort((a, b) => a.createdAt - b.createdAt),
    [nodes],
  );

  // Close popup on outside click.
  useEffect(() => {
    if (!popupOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popupContainerRef.current &&
        !popupContainerRef.current.contains(e.target as Node)
      ) {
        setPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupOpen]);

  // Time-travel: blank canvas → 240ms fade → restore saved snapshot.
  const travel = useCallback(
    async (nodeId: string) => {
      if (nodeId === currentId || navigating) return;
      setNavigating(true);
      canvasClear();
      await new Promise<void>((r) => setTimeout(r, 240));
      const node = goTo(nodeId);
      if (node) canvasRestore(node.snapshot);
      setNavigating(false);
    },
    [currentId, navigating, canvasClear, goTo, canvasRestore],
  );

  if (nodeList.length === 0) return null;

  const maxCol     = Math.max(...Object.values(layout).map((p) => p.col), 0);
  const neededW    = MARGIN_L + maxCol * NODE_GAP + NODE_R + 20;
  const isCollapsed = neededW > MAX_BAR_W;
  const barWidth   = Math.min(neededW, MAX_BAR_W);

  const activePos  = currentId ? layout[currentId] : undefined;
  const activeNode = currentId ? nodes[currentId]  : undefined;
  const activeXY   = activePos ? toXY(activePos)   : undefined;

  // ── Collapsed pill + popup ───────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <div
        ref={popupContainerRef}
        style={{
          position:             "fixed",
          bottom:               0,
          left:                 0,
          zIndex:               2000,
          height:               STRIP_H,
          display:              "flex",
          alignItems:           "center",
          padding:              "0 16px",
          background:           "rgba(0,0,0,0.65)",
          backdropFilter:       "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop:            "1px solid rgba(255,255,255,0.06)",
          borderRight:          "1px solid rgba(255,255,255,0.06)",
          borderRadius:         "0 8px 0 0",
        }}
      >
        {/* Pill toggle */}
        <button
          onClick={() => setPopupOpen((o) => !o)}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            6,
            background:     popupOpen
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.06)",
            border:         "1px solid rgba(255,255,255,0.12)",
            borderRadius:   20,
            color:          "rgba(255,255,255,0.75)",
            fontFamily:     "'JetBrains Mono', 'Fira Code', monospace",
            fontSize:       11,
            padding:        "5px 12px",
            cursor:         "pointer",
            transition:     "background 300ms ease-out, border-color 300ms ease-out",
            outline:        "none",
          }}
        >
          <span style={{ fontSize: 12, lineHeight: 1 }}>⬡</span>
          <span>{nodeList.length} nodes</span>
        </button>

        {/* Floating popup */}
        {popupOpen && (
          <div
            style={{
              position:             "absolute",
              bottom:               STRIP_H + 8,
              left:                 0,
              minWidth:             280,
              maxWidth:             360,
              background:           "rgba(0,0,0,0.85)",
              backdropFilter:       "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border:               "1px solid rgba(255,255,255,0.08)",
              borderRadius:         12,
              padding:              "8px 0",
              zIndex:               2002,
              transition:           "opacity 300ms ease-out",
            }}
          >
            {nodeList.map((node) => {
              const isActive = node.id === currentId;
              const pos      = layout[node.id];
              const isFork   = pos ? pos.row > 0 : false;
              return (
                <button
                  key={node.id}
                  onClick={() => { travel(node.id); setPopupOpen(false); }}
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        10,
                    width:      "100%",
                    padding:    "8px 14px",
                    background: isActive
                      ? "rgba(255,255,255,0.05)"
                      : "transparent",
                    border:       "none",
                    cursor:       navigating ? "wait" : "pointer",
                    textAlign:    "left",
                    transition:   "background 300ms ease-out",
                  }}
                >
                  <span
                    style={{
                      width:        6,
                      height:       6,
                      borderRadius: "50%",
                      flexShrink:   0,
                      background:   isActive
                        ? "white"
                        : isFork
                          ? "rgba(99,102,241,0.6)"
                          : "rgba(255,255,255,0.3)",
                      border: isActive
                        ? "1px solid white"
                        : isFork
                          ? "1px solid rgba(99,102,241,0.6)"
                          : "1px solid rgba(255,255,255,0.3)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily:   "'JetBrains Mono', 'Fira Code', monospace",
                      fontSize:     11,
                      color:        isActive
                        ? "rgba(255,255,255,0.9)"
                        : "rgba(255,255,255,0.55)",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap",
                      flex:         1,
                    }}
                  >
                    {node.userText}
                  </span>
                  {isActive && (
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                      →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Full expanded strip ──────────────────────────────────────────────────────
  return (
    <>
      {/* Active-node label — fixed, floats above the strip */}
      {activeNode && activeXY && (
        <motion.div
          key={currentId}
          className="pointer-events-none fixed z-[2001] -translate-x-1/2"
          style={{ left: activeXY.x, bottom: STRIP_H + 8 }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <span
            className="block max-w-[220px] truncate whitespace-nowrap rounded font-mono text-[9px] text-zinc-400"
            style={{
              padding:    "2px 8px",
              background: "rgba(18,18,20,0.92)",
              border:     "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {activeNode.userText}
          </span>
        </motion.div>
      )}

      {/* Bottom strip — left-anchored, width sized to content */}
      <div
        className="fixed bottom-0 left-0 z-[2000] overflow-y-hidden"
        style={{
          width:                barWidth,
          height:               STRIP_H,
          background:           "rgba(0,0,0,0.65)",
          backdropFilter:       "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop:            "1px solid rgba(255,255,255,0.06)",
          borderRight:          "1px solid rgba(255,255,255,0.06)",
          borderRadius:         "0 8px 0 0",
        }}
      >
        {/* SVG connecting lines */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={barWidth}
          height={STRIP_H}
          aria-hidden
        >
          {nodeList.map((node) => {
            if (!node.parentId) return null;
            const fromPos = layout[node.parentId];
            const toPos   = layout[node.id];
            if (!fromPos || !toPos) return null;
            const from   = toXY(fromPos);
            const to     = toXY(toPos);
            const isFork = fromPos.row !== toPos.row;
            return (
              <line
                key={`l-${node.id}`}
                x1={from.x} y1={from.y}
                x2={to.x}   y2={to.y}
                stroke={isFork ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.22)"}
                strokeWidth={1}
                strokeDasharray={isFork ? "4 3" : undefined}
              />
            );
          })}
        </svg>

        {/* Node buttons */}
        {nodeList.map((node) => {
          const pos = layout[node.id];
          if (!pos) return null;
          const { x, y } = toXY(pos);
          const isActive = node.id === currentId;
          const isFork   = pos.row > 0;

          return (
            <motion.button
              key={node.id}
              className="absolute focus:outline-none"
              style={{
                left:         x - NODE_R,
                top:          y - NODE_R,
                width:        NODE_R * 2,
                height:       NODE_R * 2,
                borderRadius: "50%",
                cursor:       navigating ? "wait" : "pointer",
                border: isActive
                  ? "1.5px solid rgba(255,255,255,0.95)"
                  : isFork
                    ? "1px solid rgba(99,102,241,0.6)"
                    : "1px solid rgba(255,255,255,0.3)",
                background: isActive ? "white" : "transparent",
              }}
              animate={
                isActive
                  ? {
                      boxShadow: [
                        "0 0 0px 0px rgba(255,255,255,0.7)",
                        "0 0 0px 7px rgba(255,255,255,0.0)",
                      ],
                    }
                  : { boxShadow: "none" }
              }
              transition={
                isActive
                  ? { duration: 1.7, repeat: Infinity, ease: "easeOut" }
                  : { duration: 0.3 }
              }
              whileHover={{ scale: 1.55 }}
              onClick={() => travel(node.id)}
              title={`${node.userText}\n↳ ${node.aiSummary}`}
              aria-label={node.userText}
            />
          );
        })}
      </div>
    </>
  );
}
