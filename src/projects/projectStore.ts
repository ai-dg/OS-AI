/**
 * Project Layer — multi-session state orchestration.
 *
 * Manages three projects (Email & Comms, Code Review, Hackathon Pitch), each
 * with its own canvas state, conversation history, and conversation tree. On
 * project switch the store runs the full 6-step lifecycle: save → wipe →
 * pulse → restore → swap → inject context.
 *
 * All persistence uses the jarvis_project_ prefix (CLAUDE.md requirement).
 */

import { create } from "zustand";
import type { ModelMessage } from "ai";
import type { CanvasSnapshot } from "@/store/canvasStore";
import type { TreeNode } from "@/store/treeStore";
import { useCanvasStore } from "@/store/canvasStore";
import { useTreeStore } from "@/store/treeStore";
import type { Widget } from "@/widgets/types";

// ── localStorage key convention ───────────────────────────────────────────────

const LS_PREFIX = "jarvis_project_";
const LS_ACTIVE = "jarvis_project_active";

// ── Snapshot builder helpers ──────────────────────────────────────────────────

function mkw(
  id: string, type: Widget["type"],
  x: number, y: number, ww: number, h: number,
  data: Record<string, unknown>,
): Widget {
  return { id, type, x, y, w: ww, h, scale: 1, opacity: 1, data };
}

function mksnap(...widgets: Widget[]): CanvasSnapshot {
  return {
    widgets:         Object.fromEntries(widgets.map((v) => [v.id, v])),
    order:           widgets.map((v) => v.id),
    cameraScale:     1,
    focusedId:       null,
    cameraMode:      "idle",
    cameraTargetId:  null,
    cameraZoomScale: 1,
  };
}

function iso(msBefore: number) {
  return new Date(Date.now() - msBefore).toISOString();
}

// ── Pre-seeded demo canvases ──────────────────────────────────────────────────

const EMAIL_CANVAS = mksnap(
  mkw("em1", "email-ui",  8,  4, 42, 16, { from: "sarah@acme.com",     subject: "Re: Q3 Roadmap — Board Deck",          previewText: "Looks great! The canvas prototype is exactly what I had in mind. Let's sync Thursday at 3pm.", timestamp: iso(2 * 3_600_000),  unread: true }),
  mkw("em2", "email-ui",  8, 22, 42, 16, { from: "alex@benchmark.vc",  subject: "Series A Term Sheet — Action Required", previewText: "Attached term sheet. Move quickly — flag any issues by EOD Friday.", timestamp: iso(5 * 3_600_000),  unread: true }),
  mkw("em3", "email-ui",  8, 40, 42, 16, { from: "team@anthropic.com", subject: "Hackathon check-in: 8 hours left",       previewText: "OS-AI flagged for innovative MCP tool-calling and cinematic canvas system.", timestamp: iso(26 * 3_600_000), unread: false }),
  mkw("em4", "email-ui",  8, 58, 42, 16, { from: "yc@ycombinator.com", subject: "YC Demo Day logistics",                  previewText: "Your slot is 2:15 PM in Auditorium A. Four minutes to demo, two minutes Q&A.", timestamp: iso(48 * 3_600_000), unread: true }),
);

const CODE_CANVAS = mksnap(
  mkw("cb", "bullets",  5, 10, 38, 55, { items: [
    "Pure function — zero side effects beyond the returned closure",
    "Generic over any function signature via Parameters<T>",
    "Uses ReturnType<typeof setTimeout> for Node + browser compat",
    "Closure captures timer reference between invocations",
    "Test: rapid calls must fire the callback exactly once",
  ]}),
  mkw("cc", "code",    48, 10, 47, 70, { lang: "ts", code: [
    "function debounce<T extends (...args: any[]) => void>(",
    "  fn: T,",
    "  delay: number,",
    "): (...args: Parameters<T>) => void {",
    "  let timer: ReturnType<typeof setTimeout>;",
    "  return (...args) => {",
    "    clearTimeout(timer);",
    "    timer = setTimeout(() => fn(...args), delay);",
    "  };",
    "}",
  ].join("\n") }),
);

const PITCH_CANVAS = mksnap(
  mkw("ps1", "stat",     5, 16, 20, 22, { value: "$2.4M",   label: "Q2 Revenue" }),
  mkw("ps2", "stat",     5, 50, 20, 22, { value: "< 300ms", label: "Voice → Canvas" }),
  mkw("pb",  "bullets", 30,  8, 38, 74, { items: [
    "AI-native OS — zero windows, one agent, infinite context",
    "Real-time voice → structured canvas via streaming JSON",
    "Live Gmail MCP via Anthropic's mcp_servers API",
    "Git-like conversation tree with one-click time travel",
    "Cinematic zoom, spotlight, and camera system",
    "Built in 24h at Anthropic × YC Hackathon",
  ]}),
);

// ── Project interface ─────────────────────────────────────────────────────────

export interface Project {
  id:          string;
  name:        string;
  context:     string;
  history:     ModelMessage[];
  canvasState: CanvasSnapshot | null;
  tree:        TreeNode[];
}

// ── Default projects (seeded at first run) ────────────────────────────────────

const DEFAULT_PROJECTS: Record<string, Project> = {
  email: {
    id:      "email",
    name:    "Email & Comms",
    context: "Focus on inbox triage and email management. Gmail MCP is active — render each email as an email-ui widget. Show reply progress bars when drafting responses. Prioritise unread messages at the top of the canvas.",
    history: [],
    canvasState: EMAIL_CANVAS,
    tree:    [],
  },
  code: {
    id:      "code",
    name:    "Code Review",
    context: "Technical code review mode. Always show code-block widgets with syntax highlighting. Pair each code block with a bullet-list explaining key points, edge cases, and potential issues. Focus on correctness, readability, and TypeScript best practices.",
    history: [],
    canvasState: CODE_CANVAS,
    tree:    [],
  },
  hackathon: {
    id:      "hackathon",
    name:    "Hackathon Pitch",
    context: "Final demo and pitch mode. Optimise every layout for visual impact at 10 feet distance. Use stat-card for all numbers and metrics. Use bullet-list for talking points and key highlights. Keep widgets large, minimal, and judge-ready.",
    history: [],
    canvasState: PITCH_CANVAS,
    tree:    [],
  },
};

// ── Persistence helpers ───────────────────────────────────────────────────────

type PersistedFields = Pick<Project, "history" | "canvasState" | "tree">;

function persistProject(project: Project): void {
  try {
    const { history, canvasState, tree } = project;
    localStorage.setItem(
      `${LS_PREFIX}${project.id}`,
      JSON.stringify({ history, canvasState, tree } satisfies PersistedFields),
    );
  } catch { /* ignore quota errors in private browsing */ }
}

function loadPersistedProject(id: string): Partial<PersistedFields> {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${id}`);
    if (raw) return JSON.parse(raw) as Partial<PersistedFields>;
  } catch { /* ignore corrupted data */ }
  return {};
}

function loadInitialProjects(): Record<string, Project> {
  const projects: Record<string, Project> = {};
  for (const [id, def] of Object.entries(DEFAULT_PROJECTS)) {
    const saved = loadPersistedProject(id);
    projects[id] = {
      ...def,
      history:     saved.history     ?? def.history,
      canvasState: saved.canvasState ?? def.canvasState,
      tree:        saved.tree        ?? def.tree,
    };
  }
  return projects;
}

function loadActiveProjectId(): string {
  try { return localStorage.getItem(LS_ACTIVE) ?? "email"; } catch { return "email"; }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface ProjectState {
  projects:        Record<string, Project>;
  activeProjectId: string;
  /** True during the 1s wipe+pulse between project switches. */
  isSwitching:     boolean;

  activeProject:    () => Project;
  getActiveContext: () => string;

  /**
   * 6-step switch lifecycle.
   * Pass current historyRef.current; returns the new project's history to
   * reassign to historyRef.
   */
  switchProject: (targetId: string, currentHistory: ModelMessage[]) => Promise<ModelMessage[]>;

  /** Snapshot active project to localStorage. Call on beforeunload and after each AI turn. */
  saveCurrentProject: (history: ModelMessage[]) => void;

  /**
   * reset_node — wipe every conversation-tree node everywhere: the in-memory
   * tree store AND the persisted `tree` array of every project in localStorage.
   * Canvas, history, and active project are left untouched. After this the tree
   * is empty and stays empty across reloads.
   */
  resetNodes: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects:        loadInitialProjects(),
  activeProjectId: loadActiveProjectId(),
  isSwitching:     false,

  activeProject: () => {
    const { projects, activeProjectId } = get();
    return projects[activeProjectId] ?? Object.values(projects)[0];
  },

  getActiveContext: () => get().activeProject().context,

  saveCurrentProject: (history) => {
    const { projects, activeProjectId } = get();
    const canvasSnap = useCanvasStore.getState().snapshot();
    const treeNodes  = Object.values(useTreeStore.getState().nodes);
    const updated: Project = {
      ...projects[activeProjectId],
      history,
      canvasState: canvasSnap,
      tree:        treeNodes,
    };
    set((s) => ({ projects: { ...s.projects, [activeProjectId]: updated } }));
    persistProject(updated);
    try { localStorage.setItem(LS_ACTIVE, activeProjectId); } catch { /* ignore */ }
  },

  resetNodes: () => {
    // 1. Clear the live tree (nodes / rootId / currentId).
    useTreeStore.getState().reset();
    // 2. Empty every project's persisted tree so reload doesn't bring them back.
    set((s) => {
      const projects: Record<string, Project> = {};
      for (const [id, proj] of Object.entries(s.projects)) {
        const cleared: Project = { ...proj, tree: [] };
        projects[id] = cleared;
        persistProject(cleared);
      }
      return { projects };
    });
  },

  switchProject: async (targetId, currentHistory) => {
    const { projects, activeProjectId } = get();
    if (targetId === activeProjectId || !projects[targetId]) return currentHistory;

    // ── Step 1: Save current project ─────────────────────────────────────────
    const canvasSnap = useCanvasStore.getState().snapshot();
    const treeNodes  = Object.values(useTreeStore.getState().nodes);
    const savedCurrent: Project = {
      ...projects[activeProjectId],
      history:     currentHistory,
      canvasState: canvasSnap,
      tree:        treeNodes,
    };
    set((s) => ({ projects: { ...s.projects, [activeProjectId]: savedCurrent } }));
    persistProject(savedCurrent);

    // ── Steps 2+3: Wipe canvas + start 1s pulse ───────────────────────────────
    // Flip activeProjectId first so context injection (step 6) is instant.
    set({ activeProjectId: targetId, isSwitching: true });
    useCanvasStore.getState().clear();
    try { localStorage.setItem(LS_ACTIVE, targetId); } catch { /* ignore */ }

    await new Promise<void>((r) => setTimeout(r, 1000));

    // ── Steps 4+5: Restore canvas + swap tree ─────────────────────────────────
    const newProject = get().projects[targetId];
    if (newProject.canvasState) {
      useCanvasStore.getState().restore(newProject.canvasState);
    }
    const treeStore = useTreeStore.getState();
    if (newProject.tree.length > 0) treeStore.seed(newProject.tree);
    else treeStore.reset();

    set({ isSwitching: false });

    // Return new history for App.tsx to update historyRef
    return newProject.history;
  },
}));
