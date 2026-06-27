import { useState, useEffect } from "react";
import type { Widget } from "./types";

function s(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const ASCII_ERROR = [
  "┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐",
  "│                       │",
  "│   ╳   stream failed   │",
  "│                       │",
  "└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘",
];

/**
 * Try Wikipedia's open thumbnail API first — free, no key, CORS-enabled.
 * Returns the thumbnail URL or null if the article has no image / doesn't exist.
 */
async function fetchWikipediaImage(query: string): Promise<string | null> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(query)}` +
      `&prop=pageimages&format=json&pithumbsize=800&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      query?: {
        pages?: Record<string, {
          pageid?: number;
          thumbnail?: { source: string };
        }>;
      };
    };
    const page = Object.values(data?.query?.pages ?? {})[0];
    if (!page || page.pageid === -1 || !page.thumbnail) return null;
    return page.thumbnail.source;
  } catch {
    return null;
  }
}

/** Fallback: loremflickr gives a thematic (though random) photo. */
function loremFlickrUrl(keyword: string): string {
  const slug = keyword
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `https://loremflickr.com/600/400/${encodeURIComponent(slug)}`;
}

export function DynamicImageWidget(w: Widget): JSX.Element {
  const payload = w.data.payload as Record<string, unknown> | undefined;
  const keyword = s(payload?.keyword ?? w.data.keyword, "nature");
  const caption = s(payload?.caption ?? w.data.caption);

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [frame, setFrame] = useState(0);

  // Phase 1: resolve best URL — Wikipedia first, loremflickr fallback.
  useEffect(() => {
    let cancelled = false;
    setImgSrc(null);
    setLoaded(false);
    setError(false);

    (async () => {
      const wiki = await fetchWikipediaImage(keyword);
      if (cancelled) return;
      setImgSrc(wiki ?? loremFlickrUrl(keyword));
    })();

    return () => { cancelled = true; };
  }, [keyword]);

  // Phase 2: spinner while waiting for resolution or browser decode.
  useEffect(() => {
    if (loaded || error) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [loaded, error]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 border border-dashed border-zinc-800 bg-zinc-950">
        <div
          className="select-none font-mono leading-relaxed text-zinc-700"
          style={{ fontSize: 9 }}
        >
          {ASCII_ERROR.map((row, i) => <div key={i}>{row}</div>)}
        </div>
        <div className="font-mono text-zinc-700" style={{ fontSize: 8 }}>
          [Asset: {keyword} failed to stream]
        </div>
      </div>
    );
  }

  return (
    <figure
      className="relative flex h-full flex-col gap-1 overflow-hidden"
    >
      {/* Spinner overlay — visible until the <img> fires onLoad */}
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950">
          <span className="select-none font-mono text-base text-zinc-500">
            {SPINNER[frame]}
          </span>
          <span
            className="select-none font-mono tracking-widest text-zinc-700"
            style={{ fontSize: 9 }}
          >
            STREAMING ASSET
          </span>
          <span className="select-none font-mono text-zinc-800" style={{ fontSize: 8 }}>
            {keyword}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 border border-zinc-800 bg-zinc-950 p-px">
        {imgSrc && (
          <img
            key={imgSrc}
            src={imgSrc}
            alt={caption || keyword}
            className="h-full w-full object-cover"
            style={{
              opacity: loaded ? 1 : 0,
              transition: "opacity 300ms ease-out",
            }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}
      </div>

      {caption && (
        <figcaption
          className="shrink-0 select-none text-center font-mono text-zinc-700"
          style={{ fontSize: 9 }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
