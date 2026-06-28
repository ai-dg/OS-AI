import { useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCanvasStore } from "@/store/canvasStore";
import { WIDGETS } from "@/widgets/registry";
import { ChatBox } from "@/components/ChatBox";
import { JarvisOrb } from "@/components/JarvisOrb";
import { triggerMockGmailMCPResponse } from "@/ai/gmailMCP";
import type { Widget } from "@/widgets/types";

interface CanvasProps {
  onSubmit: (text: string) => void;
  /** True while the AI is answering (thinking/speaking) — drives the orb hint. */
  isThinking: boolean;
  /** Hide/disable the chat bar — also covers the post-speech transcription gap. */
  chatBusy: boolean;
  /** Live mic amplitude (0–1) so the idle hero orb reacts to the voice. */
  voiceLevelRef?: { current: number };
}

// ─── Connecting-arrow SVG overlay ─────────────────────────────────────────────

function edgePt(
  w: Widget,
  side: "right" | "left" | "top" | "bottom"
): { x: number; y: number } {
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  return side === "right"  ? { x: w.x + w.w, y: cy }
       : side === "left"   ? { x: w.x,        y: cy }
       : side === "top"    ? { x: cx,          y: w.y }
       :                     { x: cx,          y: w.y + w.h };
}

// Accent palette for connecting arrows — the agent picks one via data.color.
const ARROW_COLORS: Record<string, string> = {
  indigo:  "#818cf8",
  emerald: "#34d399",
  amber:   "#fbbf24",
  sky:     "#38bdf8",
  red:     "#f87171",
  zinc:    "#71717a",
};

function ConnectingArrows({
  widgets,
  order,
}: {
  widgets: Record<string, Widget>;
  order: string[];
}) {
  const connections = order
    .map((id) => widgets[id])
    .filter(
      (w): w is Widget =>
        !!w && w.type === "arrow" && !!w.data.from && !!w.data.to
    );

  if (connections.length === 0) return null;

  // Render in true CSS pixels: the SVG is fullscreen (inset-0), so user units map
  // 1:1 to screen px. This keeps curves, arrowheads and labels undistorted
  // (a 0–100 viewBox with preserveAspectRatio="none" would stretch them on wide
  // screens). Canvas %→px uses the same window dims the camera transform reads.
  const W = window.innerWidth;
  const H = window.innerHeight;
  const px = (p: { x: number; y: number }) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H });

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
      style={{ zIndex: 5, overflow: "visible" }}
      aria-hidden
    >
      <defs>
        {Object.entries(ARROW_COLORS).map(([name, col]) => (
          <marker
            key={name}
            id={`canvas-tip-${name}`}
            markerWidth="10"
            markerHeight="10"
            refX="7"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill={col} />
          </marker>
        ))}
      </defs>

      {connections.map((a) => {
        const src = widgets[a.data.from as string];
        const tgt = widgets[a.data.to   as string];
        if (!src || !tgt) return null;

        const dx = (tgt.x + tgt.w / 2) - (src.x + src.w / 2);
        const dy = (tgt.y + tgt.h / 2) - (src.y + src.h / 2);
        const horiz = Math.abs(dx) >= Math.abs(dy);

        const start = px(horiz
          ? edgePt(src, dx > 0 ? "right"  : "left")
          : edgePt(src, dy > 0 ? "bottom" : "top"));
        const end = px(horiz
          ? edgePt(tgt, dx > 0 ? "left"  : "right")
          : edgePt(tgt, dy > 0 ? "top"   : "bottom"));

        // Gentle curve: bow the midpoint perpendicular to the connection so the
        // link reads as a deliberate "idea → idea" relationship, not a ruler line.
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const nx = -(end.y - start.y);
        const ny =  (end.x - start.x);
        const nlen = Math.hypot(nx, ny) || 1;
        const dist = Math.hypot(end.x - start.x, end.y - start.y);
        const bow  = Math.min(dist * 0.16, 64); // curve depth in px, capped
        const cxp = mx + (nx / nlen) * bow;
        const cyp = my + (ny / nlen) * bow;
        const d = `M ${start.x} ${start.y} Q ${cxp} ${cyp} ${end.x} ${end.y}`;

        const colKey = (a.data.color as string) in ARROW_COLORS ? (a.data.color as string) : "indigo";
        const col    = ARROW_COLORS[colKey];
        const label  = typeof a.data.label === "string" ? a.data.label : "";

        // Label anchor sits on the curve apex (quadratic point at t=0.5).
        const lx = 0.25 * start.x + 0.5 * cxp + 0.25 * end.x;
        const ly = 0.25 * start.y + 0.5 * cyp + 0.25 * end.y;

        return (
          <g key={a.id}>
            {/* Soft glow underlay */}
            <motion.path
              d={d}
              fill="none"
              stroke={col}
              strokeOpacity={0.16}
              strokeWidth={6}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            />
            {/* Main dashed connector, drawn in */}
            <motion.path
              d={d}
              fill="none"
              stroke={col}
              strokeWidth={1.6}
              strokeDasharray="6 5"
              strokeLinecap="round"
              markerEnd={`url(#canvas-tip-${colKey})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            />
            {label && (
              <motion.text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={col}
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.04em",
                  paintOrder: "stroke",
                  stroke: "#080808",
                  strokeWidth: 4,
                  strokeLinejoin: "round",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.3 }}
              >
                {label}
              </motion.text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Shell style per widget type ─────────────────────────────────────────────

interface ShellConfig {
  outerCls:    string;
  innerCls:    string;
  outerStyle?: React.CSSProperties;
}

function shellConfig(type: Widget["type"]): ShellConfig {
  switch (type) {
    case "highlight-overlay":
      return {
        outerCls: "absolute overflow-hidden",
        innerCls: "h-full w-full",
      };
    case "image-placeholder":
      return {
        outerCls: "absolute overflow-hidden border border-dashed border-zinc-700 bg-zinc-950",
        innerCls: "h-full w-full p-4",
      };
    case "email-ui":
      // Exact spec: bg #111, border rgba(255,255,255,0.08) — inline to avoid
      // Tailwind arbitrary-value escaping issues with rgba().
      return {
        outerCls:   "absolute overflow-hidden",
        innerCls:   "h-full w-full",
        outerStyle: {
          background: "#111111",
          border:     "1px solid rgba(255,255,255,0.08)",
        },
      };
    case "task-list":
      // Subject overview card: subtle white fill, hairline border, 12px radius.
      return {
        outerCls:   "absolute overflow-hidden",
        innerCls:   "h-full w-full p-4",
        outerStyle: {
          background:   "rgba(255,255,255,0.05)",
          border:       "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
        },
      };
    case "qcm":
    case "lesson":
    case "mail-compose":
    case "dialog":
      // Interactive demo widgets own their internal padding/layout — the shell
      // supplies only the card chrome (subtle fill, hairline border, 12px radius).
      return {
        outerCls:   "absolute overflow-hidden",
        innerCls:   "h-full w-full",
        outerStyle: {
          background:   "rgba(255,255,255,0.05)",
          border:       "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
        },
      };
    default:
      return {
        outerCls: "absolute overflow-hidden border border-zinc-800 bg-zinc-950",
        innerCls: "h-full w-full p-4",
      };
  }
}

// ─── Spotlight vignette overlay ───────────────────────────────────────────────
// Rendered in screen space (outside the camera motion.div) so it doesn't scale
// with the zoom transform. The radial gradient is centered on the target widget's
// canvas-percentage coordinates, which map directly to CSS % on this full-screen div.

function SpotlightOverlay({ target }: { target: Widget }) {
  const cx = target.x + target.w / 2; // 0–100 canvas %
  const cy = target.y + target.h / 2;

  // Clear radius: slightly larger than the widget's bounding box half-diagonal
  const clearR  = Math.max(target.w, target.h) * 0.65;
  const fadeEnd = clearR + 28; // gradient fade width

  return (
    <div
      className="h-full w-full"
      style={{
        background: `radial-gradient(
          circle at ${cx}% ${cy}%,
          transparent ${clearR}%,
          rgba(0, 0, 0, 0.88) ${fadeEnd}%
        )`,
      }}
    />
  );
}

// ─── Demo controller ──────────────────────────────────────────────────────────
// Floating pill at the bottom for hackathon presenters to trigger camera effects.

function CamBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "select-none px-4 py-2 font-mono text-[10px] transition-colors duration-200",
        active
          ? "bg-indigo-950/70 text-indigo-300"
          : "text-zinc-600 hover:text-zinc-300",
        disabled ? "pointer-events-none opacity-30" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DemoController() {
  const order          = useCanvasStore((s) => s.order);
  const widgets        = useCanvasStore((s) => s.widgets);
  const cameraMode     = useCanvasStore((s) => s.cameraMode);
  const zoomCamera     = useCanvasStore((s) => s.zoomCamera);
  const spotlightCamera= useCanvasStore((s) => s.spotlightCamera);
  const resetCamera    = useCanvasStore((s) => s.resetCamera);

  // First two non-arrow, non-overlay visible widget ids
  const visible = order.filter(
    (id) =>
      widgets[id] &&
      widgets[id].type !== "arrow" &&
      widgets[id].type !== "highlight-overlay"
  );
  const zoomId = visible[0] ?? null;
  const spotId = visible[1] ?? visible[0] ?? null;

  if (visible.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[1000] flex items-stretch overflow-hidden border border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
      <CamBtn
        active={cameraMode === "zoom"}
        disabled={!zoomId}
        onClick={() => zoomId && zoomCamera(zoomId, 1.8)}
      >
        [ ZOOM · {zoomId ?? "–"} ]
      </CamBtn>
      <div className="w-px self-stretch bg-zinc-800" />
      <CamBtn
        active={cameraMode === "spotlight"}
        disabled={!spotId}
        onClick={() => spotId && spotlightCamera(spotId)}
      >
        [ SPOTLIGHT · {spotId ?? "–"} ]
      </CamBtn>
      <div className="w-px self-stretch bg-zinc-800" />
      <CamBtn onClick={resetCamera}>
        [ RESET VIEW ]
      </CamBtn>
      <div className="w-px self-stretch bg-zinc-800" />
      <CamBtn onClick={triggerMockGmailMCPResponse}>
        [ GMAIL DEMO ]
      </CamBtn>
    </div>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

/**
 * Full-screen black canvas (100vw × 100vh).
 *
 * Camera system:
 *   zoom      — translates + scales the camera div to centre a target widget,
 *               dims all other widgets to 0.2 opacity. 400ms easeInOut.
 *   spotlight — radial-gradient vignette in screen space centred on target,
 *               no zoom. 400ms easeInOut.
 *   idle      — no transform, full widget opacity.
 *
 * Zoom translate formula (transform-origin: 50% 50% on a 100vw×100vh div):
 *   A point at canvas coords (cx, cy) in 0-1 range scales to screen position
 *   (W/2 + (cx·W − W/2)·S, …) under scale(S). To bring it to (W/2, H/2):
 *   tx = W·S·(0.5 − cx)
 *   ty = H·S·(0.5 − cy)
 */
export function Canvas({ onSubmit, isThinking, chatBusy, voiceLevelRef }: CanvasProps) {
  const widgets        = useCanvasStore((s) => s.widgets);
  const order          = useCanvasStore((s) => s.order);
  const cameraMode     = useCanvasStore((s) => s.cameraMode);
  const cameraTargetId = useCanvasStore((s) => s.cameraTargetId);
  const cameraZoomScale= useCanvasStore((s) => s.cameraZoomScale);
  const highlightedId  = useCanvasStore((s) => s.highlightedId);
  const cameraOffsetX  = useCanvasStore((s) => s.cameraOffsetX);
  const cameraOffsetY  = useCanvasStore((s) => s.cameraOffsetY);
  const isAISpeaking   = useCanvasStore((s) => s.isAISpeaking);
  const zoomCamera     = useCanvasStore((s) => s.zoomCamera);
  const resetCamera    = useCanvasStore((s) => s.resetCamera);

  // Spotlight / zoom: resolve target widget (may be null if despawned)
  const target = cameraTargetId ? (widgets[cameraTargetId] ?? null) : null;
  // The 100-unit horizontal band of the zoom target (0 = origin, 1 = right, 2 = far-right, …).
  // Only widgets in the same band get dimmed — off-screen districts stay at full opacity.
  const targetBand = target ? Math.floor(target.x / 100) : -1;

  // Spatial camera CSS transform. translate(-offsetX*S%, -offsetY*S%) scale(S)
  // with transform-origin: 0 0 brings canvas unit offsetX to the screen left edge.
  const S = cameraZoomScale;
  const transform = `translate(${-cameraOffsetX * S}%, ${-cameraOffsetY * S}%) scale(${S})`;

  // Ref synced to isAISpeaking for use inside stable event handlers.
  const isAISpeakingRef = useRef(false);
  useEffect(() => {
    isAISpeakingRef.current = isAISpeaking;
  }, [isAISpeaking]);

  // Viewport div ref — drag/scroll events attach here.
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number; startY: number; startOffX: number; startOffY: number;
    capturing: boolean;
  } | null>(null);

  // User navigation: drag to pan, scroll to zoom (blocked while AI is speaking).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (isAISpeakingRef.current) return;
      e.preventDefault();
      const { cameraZoomScale: cs, cameraOffsetX: ox, cameraOffsetY: oy, minZoomScale } =
        useCanvasStore.getState();
      const delta = -e.deltaY * 0.001;
      const nextS = Math.min(Math.max(cs + delta, minZoomScale), 2.5);
      const rect = el.getBoundingClientRect();
      const mxPct = ((e.clientX - rect.left) / rect.width) * 100;
      const myPct = ((e.clientY - rect.top) / rect.height) * 100;
      const canvasX = ox + mxPct / cs;
      const canvasY = oy + myPct / cs;
      // Scrolling exits zoom mode so dimmed widgets return to full opacity.
      useCanvasStore.setState({
        cameraZoomScale: nextS,
        cameraOffsetX: Math.max(0, canvasX - mxPct / nextS),
        cameraOffsetY: Math.max(0, canvasY - myPct / nextS),
        cameraMode: "idle",
        cameraTargetId: null,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isAISpeakingRef.current || e.button !== 0) return;
      const { cameraOffsetX: ox, cameraOffsetY: oy } = useCanvasStore.getState();
      // Don't capture yet — wait for movement threshold so widget onClick still fires.
      dragState.current = { startX: e.clientX, startY: e.clientY, startOffX: ox, startOffY: oy, capturing: false };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragState.current || isAISpeakingRef.current) return;
      const dxPx = e.clientX - dragState.current.startX;
      const dyPx = e.clientY - dragState.current.startY;
      // Capture the pointer only after a meaningful drag (≥5px total), so a quick
      // tap doesn't eat the widget's onClick handler via pointer capture.
      if (!dragState.current.capturing) {
        if (Math.abs(dxPx) + Math.abs(dyPx) < 5) return;
        el.setPointerCapture(e.pointerId);
        dragState.current.capturing = true;
        el.style.cursor = "grabbing";
      }
      const { cameraZoomScale: cs } = useCanvasStore.getState();
      const rect = el.getBoundingClientRect();
      const dx = (dxPx / rect.width) * 100 / cs;
      const dy = (dyPx / rect.height) * 100 / cs;
      // Dragging exits zoom mode so dimmed widgets return to full opacity.
      useCanvasStore.setState({
        cameraOffsetX: dragState.current.startOffX - dx,
        cameraOffsetY: dragState.current.startOffY - dy,
        cameraMode: "idle",
        cameraTargetId: null,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragState.current) return;
      if (dragState.current.capturing) el.releasePointerCapture(e.pointerId);
      dragState.current = null;
      el.style.cursor = isAISpeakingRef.current ? "default" : "grab";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, []); // stable — reads store via getState() and isAISpeakingRef

  // Keyboard: Cmd/Ctrl+0 fit-all, Cmd+= zoom in, Cmd+- zoom out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const { cameraZoomScale: cs, minZoomScale } = useCanvasStore.getState();
      switch (e.code) {
        case "Digit0":
          e.preventDefault();
          useCanvasStore.getState().fitAll();
          break;
        case "Equal":
          e.preventDefault();
          useCanvasStore.setState({ cameraZoomScale: Math.min(cs + 0.1, 2.5) });
          break;
        case "Minus":
          e.preventDefault();
          useCanvasStore.setState({ cameraZoomScale: Math.max(cs - 0.1, minZoomScale) });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const CAMERA_TRANSITION = { duration: 0.4, ease: "easeInOut" } as const;

  return (
    <div
      ref={viewportRef}
      className="canvas-bg relative overflow-hidden"
      style={{ width: "100vw", height: "100vh", cursor: isAISpeaking ? "default" : "grab" }}
    >
      {/* ── Default / idle page — JARVIS orb when the canvas is empty ───────── */}
      <AnimatePresence>
        {order.length === 0 && (
          <motion.div
            key="idle-hero"
            className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p
              className={`select-none font-mono text-[11px] tracking-[0.35em] transition-colors duration-300 ${
                isThinking ? "text-amber-300/70" : "text-teal-300/40"
              }`}
            >
              {isThinking ? "CTRL + C TO CANCEL" : "HOLD SPACE TO SPEAK"}
            </p>
            <JarvisOrb
              size={Math.round(
                Math.min(window.innerWidth, window.innerHeight) * 0.62,
              )}
              levelRef={voiceLevelRef}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Camera transform layer ─────────────────────────────────────────── */}
      {/* CSS transition only when AI is speaking — instant during user navigation. */}
      <div
        className={isAISpeaking ? "ai-camera" : ""}
        style={{
          position: "absolute",
          inset: 0,
          transform,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <ConnectingArrows widgets={widgets} order={order} />

        <AnimatePresence>
          {order.map((id, i) => {
            const w = widgets[id];
            if (!w) return null;
            if (w.type === "arrow" && w.data.from && w.data.to) return null;

            const Render = WIDGETS[w.type];
            const { outerCls, innerCls, outerStyle } = shellConfig(w.type);

            // In zoom mode, dim only widgets in the same 100-unit horizontal band
            // as the target. Off-screen districts (origin while zooming in right, etc.)
            // stay at full opacity — the camera has already moved away from them.
            const widgetBand = Math.floor(w.x / 100);
            const effectiveOpacity =
              cameraMode === "zoom" && cameraTargetId && id !== cameraTargetId
                && widgetBand === targetBand
                ? 0.2
                : w.opacity;

            // Emphasis pulse — the agent's "highlight" action glows one widget.
            const isHighlighted = highlightedId === id;

            return (
              <motion.div
                key={id}
                className={outerCls}
                style={{
                  left:   `${w.x}%`,
                  top:    `${w.y}%`,
                  width:  `${w.w}%`,
                  height: `${w.h}%`,
                  zIndex: isHighlighted ? 400 : 10 + i,
                  ...outerStyle,
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (cameraMode === "zoom" && cameraTargetId === id) resetCamera();
                  else zoomCamera(id, 1.6);
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{
                  opacity: effectiveOpacity,
                  scale: isHighlighted ? Math.max(w.scale, 1.04) : w.scale,
                  boxShadow: isHighlighted
                    ? [
                        "0 0 0px 0px rgba(129,140,248,0)",
                        "0 0 26px 5px rgba(129,140,248,0.55)",
                        "0 0 12px 2px rgba(129,140,248,0.30)",
                      ]
                    : "0 0 0px 0px rgba(129,140,248,0)",
                }}
                exit={{
                  opacity: 0,
                  scale: 0.95,
                  transition: { duration: 0.2, ease: "easeIn" },
                }}
                transition={{
                  opacity: CAMERA_TRANSITION,
                  scale:   { duration: 0.3, ease: "easeOut" },
                  boxShadow: isHighlighted
                    ? { duration: 1.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
                    : { duration: 0.3 },
                }}
              >
                <div className={innerCls}>
                  <Render {...w} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Spotlight vignette — screen space, outside camera transform ────── */}
      <AnimatePresence>
        {cameraMode === "spotlight" && target && (
          <motion.div
            key="spotlight"
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: 500, willChange: "opacity" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CAMERA_TRANSITION}
          >
            <SpotlightOverlay target={target} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── UI chrome ─────────────────────────────────────────────────────── */}
      {/* Visible for now: bottom typing bar (push-to-talk voice only). */}
      <ChatBox onSubmit={onSubmit} isThinking={chatBusy} />
      {/* Hidden: top-right camera/demo control bar (Zoom · Spotlight · Reset view · Gmail demo) */}
      {false && <DemoController />}
    </div>
  );
}
