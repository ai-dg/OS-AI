import { useState } from "react";
import type { Widget } from "./types";
import { useCanvasStore } from "@/store/canvasStore";

type EmailItem = {
  id: string;
  from: string;
  fromEmail?: string;
  subject: string;
  preview: string;
  body?: string;
  date: string;
  read: boolean;
  labels?: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  "#4f46e5", "#0891b2", "#059669",
  "#d97706", "#dc2626", "#7c3aed", "#0284c7",
];

function avatarColor(seed: string): string {
  const n = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length];
}

function initials(from: string): string {
  const local = from.includes("@") ? from.split("@")[0] : from;
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function s(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}

// ─── Legacy single-card fallback ─────────────────────────────────────────────

function SingleEmailCard({ w }: { w: Widget }) {
  const from      = s(w.data.from, "sender@domain.com");
  const subject   = s(w.data.subject, "(no subject)");
  const rawPrev   = s(w.data.previewText, s(w.data.preview, s(w.data.body, "")));
  const snippet   = rawPrev.length > 100 ? rawPrev.slice(0, 100) + "…" : rawPrev;
  const tsRaw     = s(w.data.timestamp);
  const unread    = Boolean(w.data.unread);
  const color     = avatarColor(from.includes("@") ? from.split("@")[0] : from);
  const init      = initials(from);
  const localPart = from.includes("@") ? from.split("@")[0] : from;
  const display   = localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex h-full items-center gap-3.5 px-4 py-2">
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {init}
        {unread && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-indigo-400"
            style={{ borderColor: "#111111" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate font-mono text-xs ${
              unread ? "font-semibold text-zinc-100" : "font-normal text-zinc-400"
            }`}
          >
            {display}
          </span>
          {tsRaw && (
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-600">
              {tsRaw}
            </span>
          )}
        </div>
        <div
          className={`mt-0.5 truncate font-mono text-[11px] ${
            unread ? "font-medium text-zinc-200" : "text-zinc-500"
          }`}
        >
          {subject}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
          {snippet}
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeletonView() {
  const widths = [62, 48, 70, 55, 65];
  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
    >
      {/* Left panel skeleton */}
      <div
        className="flex shrink-0 flex-col"
        style={{ width: "42%", borderRight: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            inbox
          </span>
          <div className="h-3 w-6 animate-pulse rounded-full bg-zinc-800" />
        </div>
        <div className="flex flex-1 flex-col divide-y divide-zinc-900">
          {widths.map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-zinc-800" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div
                  className="h-2 animate-pulse rounded bg-zinc-800"
                  style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
                />
                <div
                  className="h-2 animate-pulse rounded bg-zinc-900"
                  style={{ width: `${w - 10}%`, animationDelay: `${i * 80 + 40}ms` }}
                />
                <div
                  className="h-1.5 animate-pulse rounded bg-zinc-900/80"
                  style={{ width: `${w - 18}%`, animationDelay: `${i * 80 + 80}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — fetching indicator */}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
        <div className="flex gap-2">
          {[0, 150, 300].map((delay) => (
            <div
              key={delay}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-700"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] text-zinc-700">Fetching emails…</span>
      </div>
    </div>
  );
}

// ─── Multi-email list + detail view ──────────────────────────────────────────

function MultiEmailView({ w }: { w: Widget }) {
  const emails      = (w.data.emails as EmailItem[]);
  const unreadCount = typeof w.data.unreadCount === "number" ? w.data.unreadCount : 0;

  const [selectedId, setSelectedId] = useState<string | null>(
    (w.data.selectedId as string | null) ?? null
  );
  const [readSet, setReadSet] = useState<Set<string>>(
    new Set(emails.filter((e) => e.read).map((e) => e.id))
  );

  const selected = emails.find((e) => e.id === selectedId) ?? null;

  // Canvas dispatch — used by Reply / Forward actions to spawn compose widgets.
  const spawn = useCanvasStore((s) => s.spawn);

  function handleSelect(id: string) {
    setSelectedId(id);
    setReadSet((prev) => new Set([...prev, id]));
  }

  function handleReply(email: EmailItem) {
    const composeId = `compose-reply-${Date.now()}`;
    spawn({
      id:   composeId,
      type: "card",
      x: 15, y: 15, w: 70, h: 60,
      data: {
        title: `Re: ${email.subject}`,
        body:  `To: ${email.fromEmail ?? email.from}\nSubject: Re: ${email.subject}\n\n`,
      },
    });
  }

  function handleForward(email: EmailItem) {
    const composeId = `compose-fwd-${Date.now()}`;
    spawn({
      id:   composeId,
      type: "card",
      x: 15, y: 15, w: 70, h: 60,
      data: {
        title: `Fwd: ${email.subject}`,
        body:  `To:\nSubject: Fwd: ${email.subject}\n\n---------- Forwarded message ----------\nFrom: ${email.fromEmail ?? email.from}\n\n${email.body ?? email.preview}`,
      },
    });
  }


  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
    >
      {/* ── Left: email list ─────────────────────────────────────── */}
      <div
        className="flex shrink-0 flex-col"
        style={{
          width: "42%",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Inbox header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            inbox
          </span>
          {unreadCount > 0 && (
            <span
              className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold text-white"
              style={{ backgroundColor: "#4f46e5" }}
            >
              {unreadCount}
            </span>
          )}
        </div>

        {/* List — scrollable, scrollbar hidden */}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {emails.length === 0 ? (
            <div className="flex h-full items-center justify-center font-mono text-[10px] text-zinc-700">
              no emails
            </div>
          ) : (
            emails.map((email) => {
              const isRead     = readSet.has(email.id);
              const isSelected = selectedId === email.id;
              const color      = avatarColor(email.fromEmail ?? email.from);
              const init       = initials(email.fromEmail ?? email.from);

              return (
                <div
                  key={email.id}
                  onClick={() => handleSelect(email.id)}
                  className="flex cursor-pointer items-center gap-3 border-b border-zinc-900 px-3 py-2.5"
                  style={{
                    opacity:    isRead ? 0.6 : 1,
                    background: isSelected
                      ? "rgba(99,102,241,0.10)"
                      : "transparent",
                    transition: "background 300ms ease-out, opacity 300ms ease-out",
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {init}
                    {!isRead && (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: "#818cf8",
                          border: "1.5px solid #0d0d0d",
                        }}
                      />
                    )}
                  </div>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <span
                        className={`truncate font-mono text-[11px] ${
                          isRead ? "text-zinc-500" : "font-semibold text-zinc-100"
                        }`}
                      >
                        {email.from}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-700">
                        {email.date}
                      </span>
                    </div>
                    <div
                      className={`truncate font-mono text-[10px] ${
                        isRead ? "text-zinc-600" : "text-zinc-300"
                      }`}
                    >
                      {email.subject}
                    </div>
                    <div className="truncate font-mono text-[9px] text-zinc-700">
                      {email.preview}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: detail panel ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            {/* Detail header */}
            <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
              <div
                className="font-mono font-semibold text-zinc-100"
                style={{ fontSize: 14 }}
              >
                {selected.subject}
              </div>
              <div className="mt-1 font-mono text-[10px] text-zinc-500">
                {selected.from}
                {selected.fromEmail && selected.fromEmail !== selected.from && (
                  <span className="text-zinc-700"> &lt;{selected.fromEmail}&gt;</span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-zinc-700">
                {selected.date}
              </div>
              {selected.labels && selected.labels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.labels.map((label) => (
                    <span
                      key={label}
                      className="rounded px-1.5 py-0.5 font-mono text-[9px] text-zinc-600"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        transition: "all 300ms ease-out",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />

            {/* Body */}
            <div
              className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
              style={{ scrollbarWidth: "none" }}
            >
              <p
                className="whitespace-pre-wrap font-mono text-xs text-zinc-400"
                style={{ lineHeight: 1.6 }}
              >
                {selected.body ?? selected.preview}
              </p>
            </div>

            {/* Action bar — Reply / Forward (dispatches compose widgets via canvas store) */}
            <div
              className="flex shrink-0 items-center gap-4 border-t px-4 py-2"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              {[
                { label: "reply",   action: () => handleReply(selected)   },
                { label: "forward", action: () => handleForward(selected) },
              ].map(({ label, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="select-none font-mono text-[10px] text-zinc-700 transition-colors duration-300 hover:text-zinc-400"
                >
                  [{label}]
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[10px] text-zinc-700">Select an email</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Exported renderer ───────────────────────────────────────────────────────

export function EmailWidget(w: Widget): JSX.Element {
  if (w.data.isLoading === true)  return <LoadingSkeletonView />;
  if (Array.isArray(w.data.emails)) return <MultiEmailView w={w} />;
  return <SingleEmailCard w={w} />;
}
