import { motion } from "framer-motion";
import type { Widget } from "./types";

interface KVRow {
  label: string;
  value: string;
  accent?: boolean;
}

export function KeyValueCard(w: Widget) {
  const title = typeof w.data.title === "string" ? w.data.title : "";
  const icon  = typeof w.data.icon  === "string" ? w.data.icon  : "";
  const rows  = (Array.isArray(w.data.rows) ? w.data.rows : []) as KVRow[];

  return (
    <div className="font-mono flex h-full flex-col" style={{ padding: 14 }}>
      {title && (
        <>
          <div
            className="mb-2 flex items-center"
            style={{ gap: 6, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}
          >
            {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
            {title}
          </div>
          <div className="mb-2" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
        </>
      )}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {rows.map((row, i) => (
          <motion.div
            key={i}
            className="flex items-center justify-between"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: i * 0.06, ease: "easeOut" }}
          >
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{row.label}</span>
            <span style={{ fontSize: 12, color: row.accent ? "#6366f1" : "rgba(255,255,255,0.9)" }}>
              {row.value}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
