import { create } from "zustand";
import type { CanvasSnapshot } from "./canvasStore";

/**
 * Git-like conversation tree. Each node captures the user's utterance, the AI's
 * spoken summary, and a full canvas snapshot at that point in time. The user can
 * travel back to any node (restoring its canvas) and branch from there.
 */
export interface TreeNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  userText: string;
  aiSummary: string;
  snapshot: CanvasSnapshot;
  createdAt: number;
}

export interface TreeState {
  nodes: Record<string, TreeNode>;
  rootId: string | null;
  currentId: string | null;

  commit: (input: {
    userText: string;
    aiSummary: string;
    snapshot: CanvasSnapshot;
  }) => string;
  goTo: (id: string) => TreeNode | null;
  reset: () => void;
}

let counter = 0;
const nextId = () => `node-${Date.now().toString(36)}-${counter++}`;

export const useTreeStore = create<TreeState>((set, get) => ({
  nodes: {},
  rootId: null,
  currentId: null,

  commit: ({ userText, aiSummary, snapshot }) => {
    const id = nextId();
    const parentId = get().currentId;
    set((s) => {
      const nodes = { ...s.nodes };
      nodes[id] = {
        id,
        parentId,
        childIds: [],
        userText,
        aiSummary,
        snapshot,
        createdAt: Date.now(),
      };
      if (parentId && nodes[parentId]) {
        nodes[parentId] = {
          ...nodes[parentId],
          childIds: [...nodes[parentId].childIds, id],
        };
      }
      return {
        nodes,
        rootId: s.rootId ?? id,
        currentId: id,
      };
    });
    return id;
  },

  goTo: (id) => {
    const node = get().nodes[id];
    if (!node) return null;
    set({ currentId: id });
    return node;
  },

  reset: () => set({ nodes: {}, rootId: null, currentId: null }),
}));
