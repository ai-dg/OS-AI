/**
 * Gmail agent — direct Gmail REST API calls.
 *
 * Replaces the previous Anthropic MCP approach. Calls the Gmail API directly
 * using the OAuth token from VITE_GMAIL_TOKEN.
 *
 * All operations return GmailResult and never throw — errors surface via
 * console.log and fall back to demo emails so the canvas is never blank.
 */

// ─── Token bootstrap log ──────────────────────────────────────────────────────

const GMAIL_TOKEN = import.meta.env.VITE_GMAIL_TOKEN as string | undefined;

if (GMAIL_TOKEN) {
  console.log("[Gmail] Using real OAuth token");
} else {
  console.log("[Gmail] No token found — using demo fallback");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GmailEmail {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  read: boolean;
  labels: string[];
}

export interface GmailResult {
  emails: GmailEmail[];
  unreadCount: number;
  selectedId: string | null;
  error?: string;
}

// ─── Demo mock data ───────────────────────────────────────────────────────────

function relativeDate(ms: number): string {
  const d = new Date(Date.now() - ms);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  if (d.toDateString() === now.toDateString())       return `Today ${hh}:${mm}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${hh}:${mm}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const MOCK_EMAILS: GmailEmail[] = [
  {
    id:        "e1",
    from:      "Sarah Chen",
    fromEmail: "sarah@acme.com",
    subject:   "Re: Q3 Roadmap — Board Deck",
    preview:   "Looks great! The canvas prototype is exactly what I had in mind. Let's sync Thursday at 3pm.",
    body:      "Looks great! The canvas prototype is exactly what I had in mind. Let's sync Thursday at 3pm to walk through the demo flow before the board presentation. Sharing Figma now.",
    date:      relativeDate(2 * 3_600_000),
    read:      false,
    labels:    ["work"],
  },
  {
    id:        "e2",
    from:      "Alex Park",
    fromEmail: "alex@benchmark.vc",
    subject:   "Series A Term Sheet — Action Required",
    preview:   "Hi, attached is the term sheet for your review. We're looking to move quickly — can you confirm by EOD Friday?",
    body:      "Hi,\n\nI've attached the term sheet for your review. We're looking to move quickly — can you confirm receipt and flag any issues by EOD Friday? Our partners are fully aligned.\n\nBest,\nAlex",
    date:      relativeDate(5 * 3_600_000),
    read:      false,
    labels:    ["important"],
  },
  {
    id:        "e3",
    from:      "GitHub",
    fromEmail: "notifications@github.com",
    subject:   "[OS-AI] PR #14 — feat: voice canvas integration",
    preview:   "Pull request opened by @ai-dg: Adds real-time voice input via Web Speech API and canvas store.",
    body:      "Pull request opened by @ai-dg: Adds real-time voice input via Web Speech API, connects to the canvas store, and renders queries as staggered ticker text with sentence-level streaming.",
    date:      relativeDate(24 * 3_600_000),
    read:      true,
    labels:    ["github"],
  },
  {
    id:        "e4",
    from:      "Anthropic Team",
    fromEmail: "team@anthropic.com",
    subject:   "Hackathon check-in: 8 hours remaining",
    preview:   "OS-AI has been flagged for its innovative MCP tool-calling and cinematic canvas system. Best of luck!",
    body:      "Quick note from the Anthropic team.\n\nOS-AI has been flagged for its innovative MCP tool-calling and cinematic canvas system. Best of luck in the final stretch!",
    date:      relativeDate(26 * 3_600_000),
    read:      true,
    labels:    [],
  },
  {
    id:        "e5",
    from:      "Y Combinator",
    fromEmail: "yc@ycombinator.com",
    subject:   "YC Demo Day logistics — please read",
    preview:   "Your slot is 2:15 PM in Auditorium A. You have 4 minutes to demo and 2 minutes Q&A.",
    body:      "Final reminder: your slot is 2:15 PM in Auditorium A. You have 4 minutes to demo and 2 minutes Q&A.\n\nDoors open at 1:30 PM. Please arrive 15 minutes early to test AV.",
    date:      relativeDate(48 * 3_600_000),
    read:      false,
    labels:    ["important"],
  },
];

function mockResult(count = 5): GmailResult {
  const emails = MOCK_EMAILS.slice(0, count);
  return { emails, unreadCount: emails.filter((e) => !e.read).length, selectedId: null };
}

// ─── Gmail REST API helpers ───────────────────────────────────────────────────

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// System label IDs that aren't useful to surface in the widget.
const SYSTEM_LABELS = new Set([
  "INBOX", "UNREAD", "IMPORTANT", "SENT", "DRAFT", "TRASH", "SPAM",
  "STARRED", "CATEGORY_PERSONAL", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL", "CATEGORY_FORUMS",
]);

interface GmailApiPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailApiPart[];
}

interface GmailApiMessage {
  id: string;
  labelIds?: string[];
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GmailApiPart[];
    mimeType?: string;
  };
}

function getHeader(msg: GmailApiMessage, name: string): string {
  const lower = name.toLowerCase();
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

function parseFromHeader(raw: string): { from: string; fromEmail: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>/);
  if (match) {
    return {
      from:      match[1].trim().replace(/^"(.*)"$/, "$1"),
      fromEmail: match[2].trim(),
    };
  }
  // Plain address with no display name
  return { from: raw.trim(), fromEmail: raw.trim() };
}

function decodeBase64url(str: string): string {
  try {
    return decodeURIComponent(
      atob(str.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyFromParts(parts: GmailApiPart[]): string {
  // Prefer text/plain; fall back to text/html.
  for (const mimeType of ["text/plain", "text/html"]) {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return stripHtml(decodeBase64url(part.body.data));
      }
      // One level deeper (e.g. multipart/alternative inside multipart/mixed)
      if (part.parts) {
        for (const sub of part.parts) {
          if (sub.mimeType === mimeType && sub.body?.data) {
            return stripHtml(decodeBase64url(sub.body.data));
          }
        }
      }
    }
  }
  return "";
}

function extractBody(msg: GmailApiMessage): string {
  const direct = msg.payload?.body?.data;
  if (direct) return stripHtml(decodeBase64url(direct));
  return extractBodyFromParts(msg.payload?.parts ?? []);
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    if (d.toDateString() === now.toDateString())       return `Today ${hh}:${mm}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${hh}:${mm}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return raw;
  }
}

function parseMessage(msg: GmailApiMessage): GmailEmail {
  const { from, fromEmail } = parseFromHeader(getHeader(msg, "From"));
  const body = extractBody(msg);
  return {
    id:        msg.id,
    from,
    fromEmail,
    subject:   getHeader(msg, "Subject") || "(no subject)",
    preview:   body.slice(0, 150),
    body,
    date:      formatDate(getHeader(msg, "Date")),
    read:      !(msg.labelIds ?? []).includes("UNREAD"),
    labels:    (msg.labelIds ?? []).filter((l) => !SYSTEM_LABELS.has(l)),
  };
}

// ─── Core fetch (Step 1: list IDs → Step 2: fetch each message) ──────────────

async function fetchMessages(count: number, query?: string): Promise<GmailResult> {
  if (!GMAIL_TOKEN) return mockResult(count);

  try {
    // Step 1 — get message IDs
    const params = new URLSearchParams({ maxResults: String(count) });
    if (query) params.set("q", query);

    const listRes = await fetch(`${GMAIL_API}/messages?${params}`, {
      headers: { Authorization: `Bearer ${GMAIL_TOKEN}` },
    });

    if (!listRes.ok) {
      if (listRes.status === 401) {
        console.log("[Gmail] Token expired — using demo fallback");
        return mockResult(count);
      }
      console.log(`[Gmail] List error ${listRes.status} — using demo fallback`);
      return mockResult(count);
    }

    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = listData.messages ?? [];
    if (ids.length === 0) return { emails: [], unreadCount: 0, selectedId: null };

    // Step 2 — fetch each message in full, in parallel
    const messages = await Promise.all(
      ids.map(({ id }) =>
        fetch(`${GMAIL_API}/messages/${id}?format=full`, {
          headers: { Authorization: `Bearer ${GMAIL_TOKEN}` },
        }).then((r) => r.json() as Promise<GmailApiMessage>),
      ),
    );

    const emails = messages.map(parseMessage);
    return {
      emails,
      unreadCount: emails.filter((e) => !e.read).length,
      selectedId:  null,
    };
  } catch (e) {
    console.log("[Gmail] Fetch error — using demo fallback", e);
    return mockResult(count);
  }
}

// ─── Public operations ────────────────────────────────────────────────────────

export const gmailAgent = {
  /** Get the N most recent emails from the inbox. */
  fetchInbox: (count = 5): Promise<GmailResult> =>
    fetchMessages(count),

  /** Get the N most recent UNREAD emails. */
  fetchUnread: (count = 5): Promise<GmailResult> =>
    fetchMessages(count, "is:unread"),

  /** Search emails matching a Gmail query string. */
  searchEmails: (query: string): Promise<GmailResult> =>
    fetchMessages(10, query),

  /** Get the full message for a single email ID. */
  readEmail: (id: string): Promise<GmailResult> =>
    fetchMessages(1, `rfc822msgid:${id}`),

  /** Not yet implemented via REST — returns demo data. */
  sendEmail: (_to: string, _subject: string, _body: string): Promise<GmailResult> =>
    Promise.resolve(mockResult()),

  /** Not yet implemented via REST — returns demo data. */
  replyToEmail: (_id: string, _body: string): Promise<GmailResult> =>
    Promise.resolve(mockResult()),

  /** Fetch unread emails for an inbox summary view. */
  summarizeInbox: (): Promise<GmailResult> =>
    fetchMessages(20, "is:unread"),
};
