import { motion } from "framer-motion";
import type { Widget } from "./types";

interface TimelineItem {
  label: string;
  body?: string;
  date?: string;
  status?: "done" | "active" | "upcoming";
}

const DOT_COLOR: Record<string, string> = {
  done:     "#34d399",
  active:   "#6366f1",
  upcoming: "rgba(255,255,255,0.2)",
};

export function Timeline(w: Widget) {
  const title = typeof w.data.title === "string" ? w.data.title : "";
  const items = (Array.isArray(w.data.items) ? w.data.items : []) as TimelineItem[];

  return (
    <div className="font-mono flex h-full flex-col" style={{ padding: 14 }}>
      {title && (
        <div className="mb-3" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {title}
        </div>
      )}
      <div className="relative flex flex-col">
        {/* Vertical connecting line */}
        {items.length > 1 && (
          <div
            className="absolute"
            style={{
              left:       2.5,
              top:        8,
              bottom:     8,
              width:      1,
              background: "rgba(255,255,255,0.1)",
            }}
          />
        )}
        {items.map((item, i) => {
          const status   = item.status ?? "upcoming";
          const dotColor = DOT_COLOR[status] ?? DOT_COLOR.upcoming;
          const isActive = status === "active";

          return (
            <motion.div
              key={i}
              className="relative flex items-start"
              style={{ paddingLeft: 20, paddingBottom: i < items.length - 1 ? 16 : 0 }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.08, ease: "easeOut" }}
            >
              {/* Dot (+ pulse ring for active) */}
              <div className="absolute" style={{ left: 0, top: 3 }}>
                {isActive && (
                  <div
                    className="absolute rounded-full"
                    style={{
                      width:      12,
                      height:     12,
                      top:        -3,
                      left:       -3,
                      background: "rgba(99,102,241,0.2)",
                    }}
                  />
                )}
                <div
                  className="relative rounded-full"
                  style={{
                    width:      6,
                    height:     6,
                    zIndex:     1,
                    background: status === "upcoming" ? "transparent" : dotColor,
                    border:     status === "upcoming" ? `1px solid ${dotColor}` : "none",
                  }}
                />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="truncate"
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}
                  >
                    {item.label}
                  </span>
                  {item.date && (
                    <span
                      className="shrink-0"
                      style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}
                    >
                      {item.date}
                    </span>
                  )}
                </div>
                {item.body && (
                  <div
                    className="mt-0.5"
                    style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}
                  >
                    {item.body}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
