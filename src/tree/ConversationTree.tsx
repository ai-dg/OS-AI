import { useTreeStore } from "@/store/treeStore";
import { useCanvasStore } from "@/store/canvasStore";

/**
 * Git-like conversation history. Each dot is a turn with a saved canvas
 * snapshot; click one to time-travel back to that UI state.
 */
export function ConversationTree() {
  const nodes = useTreeStore((s) => s.nodes);
  const currentId = useTreeStore((s) => s.currentId);
  const goTo = useTreeStore((s) => s.goTo);
  const restore = useCanvasStore((s) => s.restore);

  const ordered = Object.values(nodes).sort((a, b) => a.createdAt - b.createdAt);
  if (ordered.length === 0) return null;

  const travel = (id: string) => {
    const node = goTo(id);
    if (node) restore(node.snapshot);
  };

  return (
    <div className="fixed left-4 top-1/2 z-30 -translate-y-1/2">
      <div className="flex flex-col gap-1">
        {ordered.map((n) => {
          const active = n.id === currentId;
          return (
            <button
              key={n.id}
              onClick={() => travel(n.id)}
              title={n.userText}
              className="group flex items-center gap-3 text-left"
            >
              <span
                className={`h-3 w-3 rounded-full ring-2 transition ${
                  active
                    ? "bg-sky-400 ring-sky-300"
                    : "bg-gray-600 ring-transparent group-hover:bg-gray-400"
                }`}
              />
              <span
                className={`max-w-[180px] truncate text-xs transition ${
                  active ? "text-gray-200" : "text-gray-500 group-hover:text-gray-300"
                }`}
              >
                {n.userText || "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
