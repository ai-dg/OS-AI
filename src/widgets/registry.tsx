/**
 * Widget renderer registry.
 *
 * Each entry maps a WidgetType to a render function that receives the full
 * Widget object and returns JSX. Aesthetic: cyber-minimalist / ASCII terminal —
 * solid dark backgrounds, sharp borders, font-mono throughout.
 *
 * To add a widget: add its type to types.ts, add a renderer here, register it
 * in WIDGETS below, and add a catalog entry to ai/systemPrompt.ts.
 */

import { motion } from "framer-motion";
import type { Widget, WidgetType } from "./types";
import { DynamicWidgetFactory } from "./DynamicWidgetFactory";
import { DynamicImageWidget } from "./ImageWidget";
import { EmailWidget as EmailListWidget } from "./EmailWidget";
import { MathWidget } from "./MathWidget";
import { TaskList } from "./TaskList";
import { QCMWidget } from "./QCMWidget";
import { LessonWidget } from "./LessonWidget";
import { MailCompose } from "./MailCompose";
import { Dialog } from "./Dialog";

type Renderer = (w: Widget) => JSX.Element;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function s(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

// ─── Accent palette ─────────────────────────────────────────────────────────
// Lets the AI tint any widget via data.accent. Keeps the zinc base but adds the
// pops of colour that make a dense canvas readable at a glance.

interface Accent {
  text:   string; // bright foreground (numbers, markers)
  bar:    string; // solid edge / accent stripe
  soft:   string; // low-alpha fill
  border: string; // hairline border
}

const ACCENTS: Record<string, Accent> = {
  indigo:  { text: "#a5b4fc", bar: "#6366f1", soft: "rgba(99,102,241,0.10)",  border: "rgba(99,102,241,0.30)" },
  emerald: { text: "#6ee7b7", bar: "#10b981", soft: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)" },
  amber:   { text: "#fcd34d", bar: "#f59e0b", soft: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.30)" },
  sky:     { text: "#7dd3fc", bar: "#0ea5e9", soft: "rgba(14,165,233,0.10)",  border: "rgba(14,165,233,0.30)" },
  red:     { text: "#fca5a5", bar: "#ef4444", soft: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.28)"  },
  zinc:    { text: "#e4e4e7", bar: "#52525b", soft: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.10)" },
};

function accent(v: unknown): Accent {
  return (typeof v === "string" && ACCENTS[v]) || ACCENTS.zinc;
}

// ─── Syntax highlighting ──────────────────────────────────────────────────────

const KEYWORDS = new Set([
  "async", "await", "function", "const", "let", "var", "if", "else",
  "return", "for", "while", "of", "in", "new", "class", "import",
  "from", "export", "default", "try", "catch", "throw", "switch", "case",
  "def", "with", "pass", "yield", "lambda", "and", "or", "not",
]);
const BUILTINS = new Set([
  "true", "false", "null", "undefined", "None", "True", "False",
]);

type TokKind = "kw" | "builtin" | "str" | "comment" | "num" | "plain";

const TOK_CLASS: Record<TokKind, string> = {
  kw:      "text-violet-400",
  builtin: "text-orange-400",
  str:     "text-emerald-400",
  comment: "text-zinc-500",
  num:     "text-amber-300",
  plain:   "text-zinc-300",
};

function tokenize(code: string): { kind: TokKind; value: string }[] {
  const RE =
    /(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+\.?\d*\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/g;
  const out: { kind: TokKind; value: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(code)) !== null) {
    if (m.index > last) out.push({ kind: "plain", value: code.slice(last, m.index) });
    const v = m[0];
    let kind: TokKind = "plain";
    if (/^\/\/|^#/.test(v))    kind = "comment";
    else if (/^["'`]/.test(v)) kind = "str";
    else if (/^\d/.test(v))    kind = "num";
    else if (KEYWORDS.has(v))  kind = "kw";
    else if (BUILTINS.has(v))  kind = "builtin";
    out.push({ kind, value: v });
    last = RE.lastIndex;
  }
  if (last < code.length) out.push({ kind: "plain", value: code.slice(last) });
  return out;
}

// ─── Renderers ────────────────────────────────────────────────────────────────

const TextWidget: Renderer = (w) => (
  <p className="font-mono text-xs leading-relaxed text-zinc-400">
    {s(w.data.text)}
  </p>
);

const HeadingWidget: Renderer = (w) => (
  <div className="flex h-full items-center">
    <h1 className="font-mono text-2xl font-bold tracking-tight text-zinc-100">
      {s(w.data.text)}
    </h1>
  </div>
);

const BulletsWidget: Renderer = (w) => {
  const a = accent(w.data.accent);
  const marker = typeof w.data.accent === "string" ? a.bar : "#10b981";
  return (
    <ul className="flex h-full flex-col justify-center gap-3">
      {list(w.data.items).map((item, i) => (
        <motion.li
          key={i}
          className="flex items-start gap-3"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, delay: i * 0.12, ease: "easeOut" }}
        >
          <span
            className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: marker }}
          />
          <span className="font-mono text-xs leading-relaxed text-zinc-300">{item}</span>
        </motion.li>
      ))}
    </ul>
  );
};

const StatWidget: Renderer = (w) => {
  const a = accent(w.data.accent);
  const delta = s(w.data.delta);
  // trend tints the delta chip: "up" = emerald, "down" = red, default = accent.
  const trend = s(w.data.trend);
  const deltaColor =
    trend === "up" ? ACCENTS.emerald : trend === "down" ? ACCENTS.red : a;
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
      {/* top accent rule */}
      <div
        className="absolute left-0 right-0 top-0 h-[2px]"
        style={{ background: a.bar, opacity: 0.8 }}
      />
      <motion.div
        className="font-mono font-bold leading-none tracking-tight"
        style={{ fontSize: 46, color: a.text }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {s(w.data.value)}
      </motion.div>
      {delta && (
        <span
          className="font-mono text-[10px] font-semibold"
          style={{ color: deltaColor.text }}
        >
          {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
          {delta}
        </span>
      )}
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        {s(w.data.label)}
      </div>
    </div>
  );
};

const CardWidget: Renderer = (w) => {
  const a = accent(w.data.accent);
  const hasAccent = typeof w.data.accent === "string" && w.data.accent !== "zinc";
  return (
    <div className="relative flex h-full gap-3">
      {/* Left accent spine — turns a plain box into a labelled idea. */}
      <div
        className="shrink-0 self-stretch rounded-full"
        style={{ width: 3, background: hasAccent ? a.bar : "#27272a" }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {s(w.data.title) && (
          <div
            className="pb-2.5"
            style={{ borderBottom: `1px solid ${hasAccent ? a.border : "#27272a"}` }}
          >
            <span className="select-none font-mono text-[10px]" style={{ color: a.bar }}>
              ▸{" "}
            </span>
            <span className="font-mono text-sm font-semibold text-zinc-100">
              {s(w.data.title)}
            </span>
          </div>
        )}
        <p className="font-mono text-xs leading-relaxed text-zinc-400">
          {s(w.data.body)}
        </p>
      </div>
    </div>
  );
};

const ArrowWidget: Renderer = (w) => {
  // Connecting arrows (data.from + data.to) are rendered by the SVG overlay
  // in Canvas.tsx — this widget returns nothing and its shell is hidden.
  if (w.data.from && w.data.to) return <></>;

  const dir = s(w.data.direction, "right");
  const rot = dir === "down" ? 90 : dir === "left" ? 180 : dir === "up" ? -90 : 0;
  return (
    <div className="flex h-full items-center justify-center">
      <svg
        viewBox="0 0 100 24"
        className="w-full text-zinc-500"
        style={{ transform: `rotate(${rot}deg)` }}
      >
        <line
          x1="2" y1="12" x2="84" y2="12"
          stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 4"
        />
        <polyline
          points="74,5 88,12 74,19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

const ImageWidget: Renderer = (w) => (
  <figure className="flex h-full flex-col gap-2">
    <img
      src={s(w.data.src)}
      alt={s(w.data.alt, "image")}
      className="min-h-0 flex-1 object-cover"
    />
    {s(w.data.caption) && (
      <figcaption className="select-none text-center font-mono text-[10px] text-zinc-600">
        {s(w.data.caption)}
      </figcaption>
    )}
  </figure>
);

const CodeWidget: Renderer = (w) => {
  const tokens = tokenize(s(w.data.code));
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-zinc-800" />
        <span className="h-2 w-2 rounded-full bg-zinc-800" />
        <span className="h-2 w-2 rounded-full bg-zinc-800" />
        <span className="ml-2 select-none font-mono text-[10px] text-zinc-700">
          {s(w.data.lang, "code")}
        </span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={TOK_CLASS[t.kind]}>
              {t.value}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
};

const HighlightOverlayWidget: Renderer = (w) => {
  const TINTS: Record<string, { bg: string; border: string }> = {
    indigo:  { bg: "rgba(99,102,241,0.10)",  border: "rgba(99,102,241,0.22)" },
    amber:   { bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.22)" },
    emerald: { bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.22)" },
    sky:     { bg: "rgba(14,165,233,0.10)",  border: "rgba(14,165,233,0.22)" },
    red:     { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.18)"  },
  };
  const key = s(w.data.color, "indigo");
  const { bg, border } = TINTS[key] ?? TINTS.indigo;
  return (
    <div
      className="h-full w-full"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
    />
  );
};

const ProgressBarWidget: Renderer = (w) => {
  const label  = s(w.data.label, "Progress");
  const target = typeof w.data.targetValue === "number"
    ? Math.min(100, Math.max(0, w.data.targetValue))
    : 0;
  const barColor =
    target < 33 ? "#ef4444" :
    target < 67 ? "#f59e0b" :
    "#10b981";
  const filled = Math.round(target / 5);
  const asciiBar = "█".repeat(filled) + "░".repeat(20 - filled);

  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-400">{label}</span>
        <span className="font-mono text-xs font-bold text-zinc-200">{target}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden bg-zinc-800">
        <motion.div
          className="absolute left-0 top-0 h-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: "0%" }}
          animate={{ width: `${target}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <div
        className="select-none font-mono text-zinc-700"
        style={{ fontSize: 9, letterSpacing: "-0.04em" }}
      >
        {asciiBar}
      </div>
    </div>
  );
};

const ImagePlaceholderWidget: Renderer = (w) => {
  const label = s(w.data.label, "Visual Asset");
  const desc  = s(w.data.description);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div
        className="select-none font-mono leading-tight text-zinc-700"
        style={{ fontSize: 9 }}
      >
        {["┌─────────────┐",
          "│ ▓▓▓░░░░░░░ │",
          "│ ▓▓▓▓▓░░░░░ │",
          "│ ░░░▓▓▓▓▓░░ │",
          "└─────────────┘"].map((row, i) => (
          <div key={i}>{row}</div>
        ))}
      </div>
      <div className="text-center">
        <div className="font-mono text-xs font-semibold text-zinc-500">{label}</div>
        {desc && (
          <div className="mt-1 font-mono text-[10px] text-zinc-700">{desc}</div>
        )}
      </div>
    </div>
  );
};


const EmailWidget: Renderer = (w) => (
  <div className="flex h-full flex-col overflow-hidden">
    <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
      <div className="flex gap-1">
        <span className="h-2 w-2 rounded-full bg-zinc-800" />
        <span className="h-2 w-2 rounded-full bg-zinc-800" />
        <span className="h-2 w-2 rounded-full bg-zinc-800" />
      </div>
      <span className="ml-1 select-none font-mono text-[10px] text-zinc-700">mail</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="mb-3 border-b border-zinc-800 pb-3">
        <div className="font-mono text-sm font-semibold text-zinc-100">
          {s(w.data.subject, "(no subject)")}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
          {s(w.data.from)}
        </div>
      </div>
      <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-400">
        {s(w.data.body)}
      </p>
    </div>
  </div>
);

const NetworkGraphWidget: Renderer = (w) => {
  type NodeDef = { id: string; label: string; x: number; y: number; size?: number };
  type EdgeDef = { from: string; to: string; label?: string };

  const nodes = (Array.isArray(w.data.nodes) ? w.data.nodes : []) as NodeDef[];
  const edges = (Array.isArray(w.data.edges) ? w.data.edges : []) as EdgeDef[];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const title = s(w.data.title);

  return (
    <div className="flex h-full flex-col">
      {title && (
        <div className="shrink-0 border-b border-zinc-800 px-3 py-1.5">
          <span className="select-none font-mono text-[10px] text-zinc-600">// </span>
          <span className="font-mono text-xs font-semibold text-zinc-200">{title}</span>
        </div>
      )}
      <svg className="min-h-0 flex-1 w-full" viewBox="5 5 90 90" preserveAspectRatio="xMidYMid meet">
        {edges.map((e, i) => {
          const a = nodeMap.get(e.from);
          const b = nodeMap.get(e.to);
          if (!a || !b) return null;
          return (
            <g key={i}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(99,102,241,0.35)"
                strokeWidth="0.6"
                strokeDasharray="3 2"
              />
              {e.label && (
                <text
                  x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 1.5}
                  textAnchor="middle"
                  fill="rgba(99,102,241,0.6)"
                  fontSize="2.8"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const r = n.size ?? 6;
          const initials = n.label
            .split(/\s+/)
            .map((p) => p[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <g key={n.id}>
              <circle
                cx={n.x} cy={n.y} r={r}
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="0.5"
              />
              <text
                x={n.x} y={n.y + 0.8}
                textAnchor="middle" dominantBaseline="middle"
                fill="rgb(228,228,231)"
                fontSize={Math.max(2.5, r * 0.55)}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight="600"
              >
                {initials}
              </text>
              <text
                x={n.x} y={n.y + r + 3.5}
                textAnchor="middle"
                fill="rgb(113,113,122)"
                fontSize="2.8"
                fontFamily="'JetBrains Mono', monospace"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const CircleStatWidget: Renderer = (w) => {
  const RING: Record<string, string> = {
    indigo:  "rgba(99,102,241,0.5)",
    amber:   "rgba(245,158,11,0.5)",
    emerald: "rgba(16,185,129,0.5)",
    red:     "rgba(239,68,68,0.5)",
    sky:     "rgba(14,165,233,0.5)",
  };
  const ring = RING[s(w.data.color, "indigo")] ?? RING.indigo;

  return (
    <div className="relative flex h-full items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="44"
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.8"
        />
        <circle cx="50" cy="50" r="38"
          fill="none"
          stroke={ring}
          strokeWidth="0.5"
          strokeDasharray="4 2"
        />
      </svg>
      <div className="z-10 flex flex-col items-center gap-1 text-center">
        <span className="font-mono font-bold leading-none text-white" style={{ fontSize: 38 }}>
          {s(w.data.value)}
        </span>
        <span
          className="font-mono uppercase tracking-widest text-zinc-600"
          style={{ fontSize: 9 }}
        >
          {s(w.data.label)}
        </span>
      </div>
    </div>
  );
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const WIDGETS: Record<WidgetType, Renderer> = {
  text:    TextWidget,
  heading: HeadingWidget,
  bullets: BulletsWidget,
  stat:    StatWidget,
  card:    CardWidget,
  arrow:   ArrowWidget,
  image:   ImageWidget,
  code:    CodeWidget,
  email:   EmailWidget,
  "highlight-overlay":  HighlightOverlayWidget,
  "progress-bar":       ProgressBarWidget,
  "image-placeholder":  ImagePlaceholderWidget,
  "email-ui":           (w) => EmailListWidget(w),
  // Dynamic widget types — all routed through DynamicWidgetFactory
  "custom-card":      DynamicWidgetFactory,
  "data-grid":        DynamicWidgetFactory,
  "vector-graphics":  DynamicWidgetFactory,
  "list-container":   DynamicWidgetFactory,
  "image-widget":     DynamicImageWidget,
  "network-graph":    NetworkGraphWidget,
  "circle-stat":      CircleStatWidget,
  "math-block":       MathWidget,
  "task-list":        TaskList,
  "qcm":              QCMWidget,
  "lesson":           LessonWidget,
  "mail-compose":     MailCompose,
  "dialog":           Dialog,
};
