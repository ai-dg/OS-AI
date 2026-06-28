/**
 * TaskList — subject overview card (school demo, Step 1).
 *
 * Read-only card showing a class's pending homeworks with animated progress
 * bars. Three of these spawn (80ms stagger) to give the "today's tasks" view.
 * See .claude/docs/WIDGETS.md → `task-list`.
 *
 * The outer card chrome (bg / border / radius) is applied by `shellConfig` in
 * Canvas.tsx; this renderer fills the inner area.
 */

import { motion } from "framer-motion";
import type { Widget } from "./types";

interface Task {
  title: string;
  type: string;
  progress: number;
  dueLabel: string;
  urgent: boolean;
}

function str(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}

function clampPct(v: unknown): number {
  const n = typeof v === "number" ? v : 0;
  return Math.min(100, Math.max(0, n));
}

const TYPE_LABEL: Record<string, string> = {
  qcm: "QCM",
  lesson: "LESSON",
  essay: "ESSAY",
};

function TaskRow({ task, index }: { task: Task; index: number }) {
  const pct = clampPct(task.progress);
  const done = pct >= 100;
  const barColor = done ? "#34d399" : pct === 0 ? "#3f3f46" : "#6366f1";
  const delay = index * 0.08;

  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[13px] text-zinc-200">
          {task.title}
        </span>
        <span className="shrink-0 rounded-sm bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-zinc-400">
          {TYPE_LABEL[task.type] ?? task.type.toUpperCase()}
        </span>
      </div>

      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, delay: delay + 0.15, ease: "easeOut" }}
        />
      </div>

      <div
        className="font-mono text-[10px]"
        style={{ color: task.urgent ? "#f59e0b" : "rgba(255,255,255,0.4)" }}
      >
        {task.dueLabel}
        {done ? " ✓" : ""}
      </div>
    </motion.div>
  );
}

export function TaskList(w: Widget) {
  const subject = str(w.data.subject, "Subject");
  const icon = str(w.data.icon);
  const teacher = str(w.data.teacher);
  const tasks = (Array.isArray(w.data.tasks) ? w.data.tasks : []) as Task[];

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {icon && <span className="leading-none" style={{ fontSize: 18 }}>{icon}</span>}
        <span className="font-mono font-semibold text-zinc-100" style={{ fontSize: 16 }}>
          {subject}
        </span>
      </div>
      {teacher && (
        <div className="font-mono text-[10px] text-zinc-500">{teacher}</div>
      )}

      <div className="border-t border-white/10" />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {tasks.map((t, i) => (
          <TaskRow key={i} task={t} index={i} />
        ))}
      </div>
    </div>
  );
}
