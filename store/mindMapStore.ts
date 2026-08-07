import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import {
  buildChildrenMap,
  buildParentMap,
  calcChildPosition,
  SIBLING_SPACING,
} from "@/app/editor/[id]/lib/layout";

export type SaveStatus = "idle" | "saving" | "saved";

interface MindMapStore {
  mindMapId: string;
  mindMapTitle: string;
  nodes: Node[];
  edges: Edge[];
  saveStatus: SaveStatus;

  init: (id: string, title: string, nodes: Node[], edges: Edge[]) => void;

  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;

  addChild: (parentId: string) => void;
  addSibling: (nodeId: string) => void;
  deleteSelected: () => void;
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

  applyNodeChanges: (changes) => {
    const { nodes } = get();
    const rootIds = new Set(
      nodes.filter((n) => !!n.data?.isRoot).map((n) => n.id),
    );
    const safeChanges = changes.filter(
      (c) => !(c.type === "remove" && rootIds.has(c.id)),
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
    if (!parent) return;

    const childrenMap = buildChildrenMap(edges);
    const existingChildren = childrenMap.get(parentId) || [];
    const position = calcChildPosition(parent, existingChildren, nodes);

    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: "mindmap",
      position,
      data: { label: "New Node", editing: true },
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
  },

  addSibling: (nodeId) => {
    const { nodes, edges } = get();
    const selected = nodes.find((n) => n.id === nodeId);
    if (!selected) return;

    const parentEdge = edges.find((e) => e.target === nodeId);
    if (!parentEdge || selected.data?.isRoot) {
      get().addChild(nodeId);
      return;
    }

    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: "mindmap",
      // Posisi awal tepat di bawah node yang ditekan
      // auto-layout akan finalize posisi sesungguhnya
      position: {
        x: selected.position.x,
        y: selected.position.y + SIBLING_SPACING,
      },
      data: { label: "New Node", editing: true },
      selected: true,
    };
    const newEdge: Edge = {
      id: `e-${parentEdge.source}-${id}`,
      source: parentEdge.source,
      target: id,
    };

    set((state) => {
      // Sisipkan edge baru tepat setelah edge yang target-nya nodeId
      // supaya urutan children di childrenMap benar → layout juga benar
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
  },

  deleteSelected: () => {
    set((state) => {
      const deletedIds = new Set(
        state.nodes
          .filter((n) => n.selected && !n.data?.isRoot)
          .map((n) => n.id),
      );
      return {
        nodes: state.nodes.filter((n) => !deletedIds.has(n.id)),
        edges: state.edges.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        ),
      };
    });
  },

  updateNodeStyle: (nodeId, style) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...style } } : n,
      ),
    }));
  },

  setSaveStatus: (status) => set({ saveStatus: status }),
}));
