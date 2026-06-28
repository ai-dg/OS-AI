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

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
      style={{ zIndex: 5 }}
      aria-hidden
    >
      <defs>
        <marker id="canvas-tip" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <polygon points="0 0, 7 2.5, 0 5" fill="#3f3f46" />
        </marker>
      </defs>

      {connections.map((a) => {
        const src = widgets[a.data.from as string];
        const tgt = widgets[a.data.to   as string];
        if (!src || !tgt) return null;

        const dx = (tgt.x + tgt.w / 2) - (src.x + src.w / 2);
        const dy = (tgt.y + tgt.h / 2) - (src.y + src.h / 2);
        const horiz = Math.abs(dx) >= Math.abs(dy);

        const start = horiz
          ? edgePt(src, dx > 0 ? "right"  : "left")
          : edgePt(src, dy > 0 ? "bottom" : "top");
        const end = horiz
          ? edgePt(tgt, dx > 0 ? "left"  : "right")
          : edgePt(tgt, dy > 0 ? "top"   : "bottom");

        return (
          <line
            key={a.id}
            x1={`${start.x}%`} y1={`${start.y}%`}
            x2={`${end.x}%`}   y2={`${end.y}%`}
            stroke="#3f3f46" strokeWidth="1" strokeDasharray="5 4"
            markerEnd="url(#canvas-tip)"
          />
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
  const zoomCamera     = useCanvasStore((s) => s.zoomCamera);
  const resetCamera    = useCanvasStore((s) => s.resetCamera);

  // Resolve the target widget (may be null if despawned mid-mode)
  const target = cameraTargetId ? (widgets[cameraTargetId] ?? null) : null;

  // Widget centre as 0-1 fractions of canvas
  const cx = target ? (target.x + target.w / 2) / 100 : 0.5;
  const cy = target ? (target.y + target.h / 2) / 100 : 0.5;

  // Camera translate — pixel values so Framer Motion can interpolate correctly
  const isZoomed = cameraMode === "zoom" && !!target;
  const camX     = isZoomed ? window.innerWidth  * cameraZoomScale * (0.5 - cx) : 0;
  const camY     = isZoomed ? window.innerHeight * cameraZoomScale * (0.5 - cy) : 0;
  const camS     = isZoomed ? cameraZoomScale : 1;

  const CAMERA_TRANSITION = { duration: 0.4, ease: "easeInOut" } as const;

  return (
    <div
      className="canvas-bg relative overflow-hidden"
      style={{ width: "100vw", height: "100vh" }}
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
            {/* Hint sits ABOVE the orb. While the AI is answering it becomes a
                cancel affordance (Ctrl+C) instead of the idle "hold to speak". */}
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
      <motion.div
        className="absolute inset-0"
        style={{ willChange: "transform" }}
        animate={{ x: camX, y: camY, scale: camS }}
        transition={CAMERA_TRANSITION}
      >
        <ConnectingArrows widgets={widgets} order={order} />

        <AnimatePresence>
          {order.map((id, i) => {
            const w = widgets[id];
            if (!w) return null;
            if (w.type === "arrow" && w.data.from && w.data.to) return null;

            const Render = WIDGETS[w.type];
            const { outerCls, innerCls, outerStyle } = shellConfig(w.type);

            // In zoom mode, all widgets except the target dim to 0.2.
            const effectiveOpacity =
              cameraMode === "zoom" && cameraTargetId && id !== cameraTargetId
                ? 0.2
                : w.opacity;

            return (
              <motion.div
                key={id}
                className={outerCls}
                style={{
                  left:   `${w.x}%`,
                  top:    `${w.y}%`,
                  width:  `${w.w}%`,
                  height: `${w.h}%`,
                  zIndex: 10 + i,
                  ...outerStyle,
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (cameraMode === "zoom" && cameraTargetId === id) resetCamera();
                  else zoomCamera(id, 1.6);
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: effectiveOpacity, scale: w.scale }}
                exit={{
                  opacity: 0,
                  scale: 0.95,
                  transition: { duration: 0.2, ease: "easeIn" },
                }}
                transition={{
                  opacity: CAMERA_TRANSITION,
                  scale:   { duration: 0.3, ease: "easeOut" },
                }}
              >
                <div className={innerCls}>
                  <Render {...w} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

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
      <ChatBox onSubmit={onSubmit} isThinking={chatBusy} />
      {/* Hidden: top-right camera/demo control bar (Zoom · Spotlight · Reset view · Gmail demo) */}
      {false && <DemoController />}
    </div>
  );
}
