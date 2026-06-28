/**
 * Project Layer — subject-folder state orchestration for the school demo.
 *
 * Each project is a school class (History / Maths / English), seeded from
 * `schoolData.ts`. A project holds its own canvas snapshot, conversation
 * history, conversation tree, teacher, and homework list. On project switch the
 * store runs the save → wipe → pulse → restore → swap → inject lifecycle.
 *
 * Homework answers and lesson progress are in-memory only (reset on reload and
 * on Reset Demo). Only history / canvasState / tree are persisted under the
 * jarvis_project_ prefix (CLAUDE.md requirement).
 */

import { create } from "zustand";
import type { ModelMessage } from "ai";
import type { CanvasSnapshot } from "@/store/canvasStore";
import type { TreeNode } from "@/store/treeStore";
import { useCanvasStore } from "@/store/canvasStore";
import { useTreeStore } from "@/store/treeStore";
import {
  createDefaultSchoolData,
  computeProgress,
  type Teacher,
  type Homework,
  type HomeworkData,
} from "@/projects/schoolData";

// ── localStorage key convention ───────────────────────────────────────────────

const LS_PREFIX = "jarvis_project_";
const LS_ACTIVE = "jarvis_project_active";
const DEFAULT_ACTIVE = "history";

// ── Project interface (store runtime shape) ───────────────────────────────────
//
// Distinct from schoolData's `SchoolProject`: the runtime store uses strict
// types for canvas/tree/history (CanvasSnapshot / TreeNode / ModelMessage) and
// adds the school fields (teacher, homeworks) layered on top.

export interface Project {
  id:          string;
  name:        string;
  teacher:     Teacher;
  homeworks:   Homework[];
  history:     ModelMessage[];
  canvasState: CanvasSnapshot | null;
  tree:        TreeNode[];
}

// ── Seed builder ──────────────────────────────────────────────────────────────

/** Build the runtime project record from fresh school data. */
function seedProjects(): Record<string, Project> {
  const school = createDefaultSchoolData();
  const out: Record<string, Project> = {};
  for (const [id, p] of Object.entries(school)) {
    out[id] = {
      id:          p.id,
      name:        p.name,
      teacher:     p.teacher,
      homeworks:   p.homeworks,
      history:     [],
      canvasState: null,
      tree:        [],
    };
  }
  return out;
}

// ── System prompt context ─────────────────────────────────────────────────────

/** The teacher + homework context injected into the system prompt on switch. */
function buildProjectContext(project: Project): string {
  const hw = project.homeworks
    .map((h) => {
      const progress = computeProgress(h);
      return `- ${h.title} (${h.type}, ${progress}% complete, due: ${h.dueLabel})`;
    })
    .join("\n");

  return `
ACTIVE CLASS: ${project.name}
TEACHER: ${project.teacher.name} <${project.teacher.email}>
HOMEWORKS:
${hw}

You are helping a student with their ${project.name} coursework. Spawn widgets appropriate
to the task type: 'qcm' for quizzes, 'lesson' for interactive lessons, 'mail-compose' when
the student wants to email their teacher. Always use the teacher's real name and email.
  `.trim();
}

// ── Persistence helpers ───────────────────────────────────────────────────────
//
// Only history / canvasState / tree are persisted. teacher / homeworks always
// come fresh from schoolData on init, so homework progress is in-memory only.

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
  const projects = seedProjects();
  for (const id of Object.keys(projects)) {
    const saved = loadPersistedProject(id);
    projects[id] = {
      ...projects[id],
      history:     saved.history     ?? projects[id].history,
      canvasState: saved.canvasState ?? projects[id].canvasState,
      tree:        saved.tree        ?? projects[id].tree,
    };
  }
  return projects;
}

function loadActiveProjectId(): string {
  try { return localStorage.getItem(LS_ACTIVE) ?? DEFAULT_ACTIVE; } catch { return DEFAULT_ACTIVE; }
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

  /** Synchronous active-project set (no animation). Used by live AI / demoStore. */
  setActiveProject: (id: string) => void;

  /** Merge a patch into a homework's `data` (e.g. QCM answers, lesson beat). */
  updateHomeworkData: (projectId: string, homeworkId: string, patch: Partial<HomeworkData>) => void;

  /** Snapshot active project to localStorage. Call on beforeunload and after each AI turn. */
  saveCurrentProject: (history: ModelMessage[]) => void;

  /**
   * reset_node — wipe every conversation-tree node everywhere: the in-memory
   * tree store AND the persisted `tree` array of every project in localStorage.
   * Canvas, history, and active project are left untouched.
   */
  resetNodes: () => void;

  /**
   * Full demo reset (called by demoStore.reset()). Restores fresh school data,
   * clears canvas + tree + persisted state, and returns to the default class.
   */
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects:        loadInitialProjects(),
  activeProjectId: loadActiveProjectId(),
  isSwitching:     false,

  activeProject: () => {
    const { projects, activeProjectId } = get();
    return projects[activeProjectId] ?? Object.values(projects)[0];
  },

  getActiveContext: () => buildProjectContext(get().activeProject()),

  setActiveProject: (id) => {
    const { projects } = get();
    if (!projects[id]) return;
    set({ activeProjectId: id });
    try { localStorage.setItem(LS_ACTIVE, id); } catch { /* ignore */ }
    const proj = projects[id];
    const canvas = useCanvasStore.getState();
    canvas.clear();
    if (proj.canvasState) canvas.restore(proj.canvasState);
  },

  updateHomeworkData: (projectId, homeworkId, patch) =>
    set((s) => {
      const project = s.projects[projectId];
      if (!project) return s;
      const homeworks = project.homeworks.map((h) =>
        h.id === homeworkId ? { ...h, data: { ...h.data, ...patch } as HomeworkData } : h,
      );
      return { projects: { ...s.projects, [projectId]: { ...project, homeworks } } };
    }),

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

  reset: () => {
    // Fresh school data, in-memory only — drop persisted snapshots too.
    const projects = seedProjects();
    for (const id of Object.keys(projects)) {
      try { localStorage.removeItem(`${LS_PREFIX}${id}`); } catch { /* ignore */ }
    }
    try { localStorage.setItem(LS_ACTIVE, DEFAULT_ACTIVE); } catch { /* ignore */ }
    useCanvasStore.getState().clear();
    useTreeStore.getState().reset();
    set({ projects, activeProjectId: DEFAULT_ACTIVE, isSwitching: false });
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
