import { motion } from "framer-motion";
import type { Widget } from "./types";

type CalloutType = "info" | "warning" | "success" | "tip" | "quote";

const STYLES: Record<CalloutType, { border: string; bg: string; titleColor: string }> = {
  info:    { border: "#6366f1",               bg: "rgba(99,102,241,0.06)",   titleColor: "#6366f1"               },
  tip:     { border: "#6366f1",               bg: "rgba(99,102,241,0.06)",   titleColor: "#6366f1"               },
  warning: { border: "#f59e0b",               bg: "rgba(245,158,11,0.06)",   titleColor: "#f59e0b"               },
  success: { border: "#34d399",               bg: "rgba(52,211,153,0.06)",   titleColor: "#34d399"               },
  quote:   { border: "rgba(255,255,255,0.2)", bg: "rgba(255,255,255,0.03)",  titleColor: "rgba(255,255,255,0.6)" },
};

export function Callout(w: Widget) {
  const type  = ((w.data.type as string) ?? "info") as CalloutType;
  const icon  = typeof w.data.icon  === "string" ? w.data.icon  : "";
  const title = typeof w.data.title === "string" ? w.data.title : "";
  const body  = typeof w.data.body  === "string" ? w.data.body  : "";
  const st    = STYLES[type] ?? STYLES.info;

  return (
    <motion.div
      className="font-mono h-full"
      style={{
        background:  st.bg,
        borderLeft:  `3px solid ${st.border}`,
        padding:     "12px 14px",
      }}
      initial={{ x: -8 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {title && (
        <div
          className="mb-1.5 flex items-center"
          style={{ gap: 6, fontSize: 12, fontWeight: 500, color: st.titleColor }}
        >
          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
          {title}
        </div>
      )}
      <p
        style={{
          fontSize:  12,
          color:     "rgba(255,255,255,0.75)",
          lineHeight: 1.6,
          fontStyle: type === "quote" ? "italic" : "normal",
        }}
      >
        {!title && icon && <span style={{ fontSize: 16, marginRight: 6 }}>{icon}</span>}
        {body}
      </p>
    </motion.div>
  );
}
