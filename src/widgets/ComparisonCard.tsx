import { motion } from "framer-motion";
import type { Widget } from "./types";

interface CompAttribute {
  label: string;
  value: string;
}

interface CompOption {
  name:        string;
  badge?:      string;
  attributes:  CompAttribute[];
}

export function ComparisonCard(w: Widget) {
  const title     = typeof w.data.title     === "string" ? w.data.title     : "";
  const highlight = typeof w.data.highlight === "string" ? w.data.highlight : "";
  const options   = (Array.isArray(w.data.options) ? w.data.options : []) as CompOption[];

  // Degrade: 1 option → key-value-card style
  if (options.length === 1) {
    const opt = options[0];
    return (
      <div className="font-mono flex h-full flex-col" style={{ padding: 14 }}>
        {title && (
          <div className="mb-2" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{title}</div>
        )}
        <div className="mb-2" style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
          {opt.name}
        </div>
        {opt.badge && (
          <div
            className="mb-2 inline-block px-1.5 py-0.5"
            style={{ fontSize: 10, background: "rgba(99,102,241,0.15)", color: "#6366f1", borderRadius: 4 }}
          >
            {opt.badge}
          </div>
        )}
        <div className="flex flex-col" style={{ gap: 6 }}>
          {(opt.attributes ?? []).map((attr, i) => (
            <div key={i} className="flex flex-col" style={{ gap: 1 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{attr.label}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)" }}>{attr.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono flex h-full flex-col" style={{ padding: 14 }}>
      {title && (
        <div className="mb-3" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{title}</div>
      )}
      <div
        className="flex-1"
        style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((opt, i) => {
          const isHighlighted = !!highlight && opt.name === highlight;
          const isLast        = i === options.length - 1;

          return (
            <motion.div
              key={i}
              className="flex flex-col"
              style={{
                paddingLeft:  i === 0 ? 0 : 12,
                paddingRight: isLast  ? 0 : 12,
                borderRight:  !isLast ? "1px solid rgba(255,255,255,0.06)" : "none",
                borderRadius: isHighlighted ? 4 : 0,
                background:   isHighlighted ? "rgba(99,102,241,0.05)" : "transparent",
                boxShadow:    isHighlighted ? "inset 0 0 0 1px rgba(99,102,241,0.3)" : "none",
              }}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: i * 0.08, ease: "easeOut" }}
            >
              <div className="mb-2">
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
                  {opt.name}
                </div>
                {opt.badge && (
                  <div
                    className="mt-1 inline-block px-1.5 py-0.5"
                    style={{
                      fontSize:     10,
                      background:   "rgba(99,102,241,0.15)",
                      color:        "#6366f1",
                      borderRadius: 4,
                    }}
                  >
                    {opt.badge}
                  </div>
                )}
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {(opt.attributes ?? []).map((attr, j) => (
                  <div key={j} className="flex flex-col" style={{ gap: 1 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{attr.label}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)" }}>{attr.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
