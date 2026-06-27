import type { Widget, WidgetType } from "./types";

/**
 * Widget databank. Each entry renders one widget type from its `data` payload.
 * Adding a new widget = add a type in types.ts, a renderer here, and a line in
 * the system prompt catalog (src/ai/systemPrompt.ts).
 */

type Renderer = (w: Widget) => JSX.Element;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];

const TextWidget: Renderer = (w) => (
  <p className="text-lg leading-relaxed text-gray-200">{str(w.data.text)}</p>
);

const HeadingWidget: Renderer = (w) => (
  <h1 className="text-4xl font-semibold tracking-tight text-white">
    {str(w.data.text)}
  </h1>
);

const BulletsWidget: Renderer = (w) => (
  <ul className="space-y-2">
    {list(w.data.items).map((item, i) => (
      <li key={i} className="flex items-start gap-3 text-gray-200">
        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
        <span className="text-lg">{item}</span>
      </li>
    ))}
  </ul>
);

const StatWidget: Renderer = (w) => (
  <div className="flex h-full flex-col items-center justify-center text-center">
    <div className="text-6xl font-bold text-sky-300">{str(w.data.value)}</div>
    <div className="mt-2 text-sm uppercase tracking-widest text-gray-400">
      {str(w.data.label)}
    </div>
  </div>
);

const CardWidget: Renderer = (w) => (
  <div className="flex h-full flex-col">
    {str(w.data.title) && (
      <h3 className="mb-2 text-xl font-medium text-white">{str(w.data.title)}</h3>
    )}
    <p className="text-gray-300">{str(w.data.body)}</p>
  </div>
);

const ArrowWidget: Renderer = (w) => {
  const dir = str(w.data.direction, "right");
  const rot =
    dir === "down" ? 90 : dir === "left" ? 180 : dir === "up" ? -90 : 0;
  return (
    <div className="flex h-full items-center justify-center">
      <svg
        viewBox="0 0 100 24"
        className="w-full text-sky-400"
        style={{ transform: `rotate(${rot}deg)` }}
      >
        <line x1="2" y1="12" x2="86" y2="12" stroke="currentColor" strokeWidth="3" />
        <polyline
          points="74,4 90,12 74,20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
};

const ImageWidget: Renderer = (w) => (
  <figure className="flex h-full flex-col">
    <img
      src={str(w.data.src)}
      alt={str(w.data.alt, "image")}
      className="min-h-0 flex-1 rounded-lg object-cover"
    />
    {str(w.data.caption) && (
      <figcaption className="mt-2 text-center text-sm text-gray-400">
        {str(w.data.caption)}
      </figcaption>
    )}
  </figure>
);

const CodeWidget: Renderer = (w) => (
  <pre className="h-full overflow-auto rounded-lg bg-black/60 p-4 font-mono text-sm leading-relaxed text-emerald-300">
    <code>{str(w.data.code)}</code>
  </pre>
);

const EmailWidget: Renderer = (w) => (
  <div className="flex h-full flex-col overflow-hidden rounded-lg bg-[#0c0f14] ring-1 ring-white/10">
    <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2">
      <span className="h-3 w-3 rounded-full bg-red-400/80" />
      <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
      <span className="h-3 w-3 rounded-full bg-green-400/80" />
      <span className="ml-3 text-xs text-gray-400">Gmail</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 border-b border-white/5 pb-3">
        <div className="text-base font-medium text-white">{str(w.data.subject, "(no subject)")}</div>
        <div className="mt-1 text-sm text-gray-400">
          {str(w.data.from, "unknown@sender")}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
        {str(w.data.body)}
      </p>
    </div>
  </div>
);

export const WIDGETS: Record<WidgetType, Renderer> = {
  text: TextWidget,
  heading: HeadingWidget,
  bullets: BulletsWidget,
  stat: StatWidget,
  card: CardWidget,
  arrow: ArrowWidget,
  image: ImageWidget,
  code: CodeWidget,
  email: EmailWidget,
};
