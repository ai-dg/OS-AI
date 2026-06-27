import { AnimatePresence, motion } from "framer-motion";
import { useCanvasStore } from "@/store/canvasStore";
import { WIDGETS } from "@/widgets/registry";

/**
 * The black canvas. Widgets are absolutely positioned by percentage and
 * animated in/out. The whole layer scales with the camera for global zoom.
 */
export function Canvas() {
  const widgets = useCanvasStore((s) => s.widgets);
  const order = useCanvasStore((s) => s.order);
  const cameraScale = useCanvasStore((s) => s.cameraScale);

  return (
    <motion.div
      className="canvas-bg absolute inset-0 overflow-hidden"
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
  );
}
