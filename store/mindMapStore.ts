import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type { DragDecision } from "@/app/editor/[id]/lib/dragEngine";
import { buildChildrenMap } from "@/app/editor/[id]/lib/layout";

export type SaveStatus = "idle" | "saving" | "saved";
export type DropZone = "before" | "after" | "child";

interface MindMapStore {
  mindMapId: string;
  mindMapTitle: string;
  nodes: Node[];
  edges: Edge[];
  saveStatus: SaveStatus;

  setSelectedNode: (nodeId: string) => void;
  init: (id: string, title: string, nodes: Node[], edges: Edge[]) => void;
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  addChild: (parentId: string) => string | null;
  addSibling: (nodeId: string) => string | null;
  deleteSelected: () => void;
  commitDragDecision: (decision: DragDecision) => void;
  orphanNode: (nodeId: string) => void;
  updateNodeStyle: (nodeId: string, style: Record<string, unknown>) => void;
  setSaveStatus: (status: SaveStatus) => void;
}

export const useMindMapStore = create<MindMapStore>((set, get) => ({
  mindMapId: "",
  mindMapTitle: "",
  nodes: [],
  edges: [],
  saveStatus: "idle",

  init: (id, title, nodes, edges) => {
    set({ mindMapId: id, mindMapTitle: title, nodes, edges });
  },

  // mindMapStore.ts
  applyNodeChanges: (changes) => {
    const { nodes } = get();
    const rootIds = new Set(
      nodes.filter((n) => !!n.data?.isRoot).map((n) => n.id),
    );
    const safeChanges = changes.filter(
      (c) => !(c.type === "remove" && rootIds.has(c.id)) && c.type !== "select",
    );
    set((state) => ({
      nodes: applyNodeChanges(safeChanges, state.nodes),
    }));
  },

  applyEdgeChanges: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  addChild: (parentId) => {
    const { nodes, edges } = get();
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return null;

    const siblingCount = edges.filter((e) => e.source === parentId).length;
    const n = siblingCount + 1;

    const isParentRoot = !!parent.data?.isRoot;
    const label = isParentRoot ? `Main Topic ${n}` : `Subtopic ${n}`;

    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: "mindmap",
      position: { x: parent.position.x, y: parent.position.y },
      data: { label },
      selected: true,
    };
    const newEdge: Edge = {
      id: `e-${parentId}-${id}`,
      source: parentId,
      target: id,
    };

    set((state) => ({
      nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), newNode],
      edges: [...state.edges, newEdge],
    }));

    return id;
  },

  addSibling: (nodeId) => {
    const { nodes, edges } = get();
    const selected = nodes.find((n) => n.id === nodeId);
    if (!selected) return null;

    const parentEdge = edges.find((e) => e.target === nodeId);
    if (!parentEdge || selected.data?.isRoot) {
      return get().addChild(nodeId);
    }

    const parentId = parentEdge.source;
    const parent = nodes.find((n) => n.id === parentId);

    const siblingCount = edges.filter((e) => e.source === parentId).length;
    const n = siblingCount + 1;

    const isParentRoot = !!parent?.data?.isRoot;
    const label = isParentRoot ? `Main Topic ${n}` : `Subtopic ${n}`;

    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: "mindmap",
      position: { x: selected.position.x, y: selected.position.y },
      data: { label },
      selected: true,
    };
    const newEdge: Edge = {
      id: `e-${parentId}-${id}`,
      source: parentId,
      target: id,
    };

    set((state) => {
      const insertedEdges: Edge[] = [];
      for (const e of state.edges) {
        insertedEdges.push(e);
        if (e.target === nodeId) insertedEdges.push(newEdge);
      }
      return {
        nodes: [
          ...state.nodes.map((n) => ({ ...n, selected: false })),
          newNode,
        ],
        edges: insertedEdges,
      };
    });

    return id;
  },

  deleteSelected: () => {
    set((state) => {
      const toDelete = state.nodes.filter((n) => n.selected && !n.data?.isRoot);
      const childrenMap = buildChildrenMap(state.edges);
      const deletedIds = new Set(toDelete.map((n) => n.id));
      for (const node of toDelete) {
        const stack = [...(childrenMap.get(node.id) ?? [])];
        while (stack.length > 0) {
          const id = stack.pop()!;
          deletedIds.add(id);
          stack.push(...(childrenMap.get(id) ?? []));
        }
      }

      const focusIds = new Set<string>();
      for (const node of toDelete) {
        const parentEdge = state.edges.find((e) => e.target === node.id);
        if (!parentEdge) continue;

        const parentId = parentEdge.source;
        const siblings = state.edges
          .filter((e) => e.source === parentId && !deletedIds.has(e.target))
          .map((e) => e.target);

        if (siblings.length > 0) {
          const allChildren = state.edges
            .filter((e) => e.source === parentId)
            .map((e) => e.target);
          const idx = allChildren.indexOf(node.id);
          const before = allChildren
            .slice(0, idx)
            .filter((id) => !deletedIds.has(id));
          const after = allChildren
            .slice(idx + 1)
            .filter((id) => !deletedIds.has(id));
          const target = before[before.length - 1] ?? after[0];
          if (target) focusIds.add(target);
        } else {
          focusIds.add(parentId);
        }
      }

      return {
        nodes: state.nodes
          .filter((n) => !deletedIds.has(n.id))
          .map((n) =>
            focusIds.has(n.id)
              ? { ...n, selected: true }
              : { ...n, selected: false },
          ),
        edges: state.edges.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        ),
      };
    });
  },

  setSelectedNode: (nodeId: string) => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    }));
  },

  updateNodeStyle: (nodeId, style) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...style } } : n,
      ),
    }));
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  orphanNode: (nodeId) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.data?.isRoot) return;
    set((state) => ({
      edges: state.edges.filter((e) => e.target !== nodeId),
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                isOrphan: true,
                orphanAnchorY: n.position.y,
              },
            }
          : n,
      ),
    }));
  },

  commitDragDecision: (decision) => {
    if (decision.type === "BLOCK") return;

    set((state) => {
      if (decision.type === "REPARENT") {
        const filtered = state.edges.filter(
          (e) => e.target !== decision.dragId,
        );
        return {
          edges: [
            ...filtered,
            {
              id: `e-${decision.targetId}-${decision.dragId}`,
              source: decision.targetId,
              target: decision.dragId,
            },
          ],
        };
      }

      const filtered = state.edges.filter((e) => e.target !== decision.dragId);

      if (!decision.newParentId) {
        return { edges: filtered };
      }

      const newEdge = {
        id: `e-${decision.newParentId}-${decision.dragId}`,
        source: decision.newParentId,
        target: decision.dragId,
      };
      const targetEdgeIndex = filtered.findIndex(
        (e) => e.target === decision.targetId,
      );
      const insertIndex =
        decision.type === "REORDER_BEFORE"
          ? targetEdgeIndex
          : targetEdgeIndex + 1;

      const result = [...filtered];
      result.splice(insertIndex, 0, newEdge);
      return { edges: result };
    });
  },
}));
