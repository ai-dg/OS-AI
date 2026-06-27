import { AnimatePresence, motion } from "framer-motion";

/**
 * The ephemeral speech display: one small rectangle near the bottom showing the
 * sentence the AI is currently saying. Each new sentence replaces the last —
 * nothing accumulates on screen.
 */
export function Ticker({ sentence }: { sentence: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {sentence && (
          <motion.div
            key={sentence}
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
            transition={{ duration: 0.25 }}
            className="max-w-2xl rounded-2xl bg-white/[0.06] px-6 py-3 text-center text-lg text-gray-100 ring-1 ring-white/10 backdrop-blur-md"
          >
            {sentence}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
