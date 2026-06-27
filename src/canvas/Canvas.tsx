import { AnimatePresence, motion } from "framer-motion";
import { useCanvasStore } from "@/store/canvasStore";
import { WIDGETS } from "@/widgets/registry";
import { ChatBox } from "@/components/ChatBox";

interface CanvasProps {
  onSubmit: (text: string) => void;
  isThinking: boolean;
}

/**
 * The full-screen black canvas (#080808). It fills 100vw x 100vh, has no chrome
 * and no scrollbars, and is position:relative so widgets can be absolutely
 * positioned by percentage. A subtle 1px dot grid (3% opacity, see .canvas-bg)
 * gives spatial depth. Widgets sit on an inner layer that scales with the
 * camera; the grid on the parent stays fixed so it never distorts on zoom.
 */
export function Canvas({ onSubmit, isThinking }: CanvasProps) {
  const widgets = useCanvasStore((s) => s.widgets);
  const order = useCanvasStore((s) => s.order);
  const cameraScale = useCanvasStore((s) => s.cameraScale);

  return (
    <div
      className="canvas-bg relative overflow-hidden"
      style={{ width: "100vw", height: "100vh" }}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ scale: cameraScale }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      >
        <AnimatePresence>
          {order.map((id, i) => {
            const w = widgets[id];
            if (!w) return null;
            const Render = WIDGETS[w.type];
            return (
              <motion.div
                key={id}
                className="absolute"
                style={{
                  left: `${w.x}%`,
                  top: `${w.y}%`,
                  width: `${w.w}%`,
                  height: `${w.h}%`,
                  zIndex: 10 + i,
                }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: w.opacity, scale: w.scale }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 200, damping: 24 }}
              >
                <div className="h-full w-full rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10 backdrop-blur-sm">
                  <Render {...w} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
      <ChatBox onSubmit={onSubmit} isThinking={isThinking} />
    </div>
  );
}
