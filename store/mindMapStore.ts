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
import type { CanvasTheme } from "@/app/editor/[id]/lib/themes";

export type SaveStatus = "idle" | "saving" | "saved";
export type DropZone = "before" | "after" | "child";

export interface ClipboardSubtreeNode {
  data: Record<string, unknown>;
  image: { url: string; publicId: string } | null;
  children: ClipboardSubtreeNode[];
}

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

interface MindMapStore {
  mindMapId: string;
  mindMapTitle: string;
  nodes: Node[];
  edges: Edge[];
  saveStatus: SaveStatus;
  clipboard: ClipboardSubtreeNode | null;
  canvasTheme: CanvasTheme;
  setCanvasTheme: (theme: CanvasTheme) => void;

  // History
  past: Snapshot[];
  future: Snapshot[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  setSelectedNode: (nodeId: string) => void;
  init: (
    id: string,
    title: string,
    nodes: Node[],
    edges: Edge[],
    canvasTheme: CanvasTheme,
  ) => void;
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  addChild: (parentId: string, _skipHistory?: boolean) => string | null;
  addSibling: (nodeId: string, _skipHistory?: boolean) => string | null;
  deleteSelected: () => void;
  commitDragDecision: (decision: DragDecision) => void;
  orphanNode: (nodeId: string) => void;
  updateNodeStyle: (nodeId: string, style: Record<string, unknown>) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setNodeImage: (nodeId: string, url: string, publicId: string) => void;
  removeNodeImage: (nodeId: string) => void;
  setNodeImageUploading: (nodeId: string, uploading: boolean) => void;
  copyNode: (nodeId: string) => void;
  pasteNode: (
    mode: "child" | "orphan",
    payload: string | { x: number; y: number },
  ) => string | null;
  selectAll: () => void;
}

export const useMindMapStore = create<MindMapStore>((set, get) => ({
  mindMapId: "",
  mindMapTitle: "",
  nodes: [],
  edges: [],
  saveStatus: "idle",
  clipboard: null,
  canvasTheme: "dark",
  setCanvasTheme: (theme) => set({ canvasTheme: theme }),
  past: [],
  future: [],

  pushHistory: () => {
    const { nodes, edges, past } = get();
    const snapshot: Snapshot = {
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: [...edges],
    };
    const newPast = [...past, snapshot];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [] });
  },

  undo: () => {
    const { past, nodes, edges, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const currentSnapshot: Snapshot = {
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: [...edges],
    };
    set({
      past: newPast,
      future: [currentSnapshot, ...future],
      nodes: prev.nodes,
      edges: prev.edges,
    });
  },

  redo: () => {
    const { past, nodes, edges, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    const currentSnapshot: Snapshot = {
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: [...edges],
    };
    set({
      past: [...past, currentSnapshot],
      future: newFuture,
      nodes: next.nodes,
      edges: next.edges,
    });
  },

  init: (id, title, nodes, edges, canvasTheme) => {
    set({
      mindMapId: id,
      mindMapTitle: title,
      nodes,
      edges,
      canvasTheme,
      past: [],
      future: [],
    });
  },

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

  addChild: (parentId, _skipHistory) => {
    if (!_skipHistory) get().pushHistory();
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
      nodes: [
        ...state.nodes.map((n) =>
          n.id === parentId
            ? { ...n, data: { ...n.data, collapsed: false }, selected: false }
            : { ...n, selected: false },
        ),
        newNode,
      ],
      edges: [...state.edges, newEdge],
    }));

    return id;
  },

  addSibling: (nodeId, _skipHistory) => {
    if (!_skipHistory) get().pushHistory();
    const { nodes, edges } = get();
    const selected = nodes.find((n) => n.id === nodeId);
    if (!selected) return null;

    const parentEdge = edges.find((e) => e.target === nodeId);
    if (!parentEdge || selected.data?.isRoot) {
      return get().addChild(nodeId, true); // skip history, sudah push di atas
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
    get().pushHistory();
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
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...style } } : n,
      ),
    }));
  },

  updateNodeLabel: (nodeId, label) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, label, needsLayout: true } }
          : n,
      ),
    }));
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  setNodeImage: (nodeId, url, publicId) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                imageUrl: url,
                imagePublicId: publicId,
                imageUploading: false,
              },
            }
          : n,
      ),
    }));
  },

  removeNodeImage: (nodeId) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const { imageUrl, imagePublicId, imageUploading, ...restData } = n.data;
        return { ...n, data: { ...restData, needsLayout: true } };
      }),
    }));
  },

  setNodeImageUploading: (nodeId, uploading) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: { ...n.data, imageUploading: uploading, needsLayout: true },
            }
          : n,
      ),
    }));
  },

  copyNode: (nodeId) => {
    const { nodes, edges } = get();
    const childrenMap = buildChildrenMap(edges);

    const buildSnapshot = (id: string): ClipboardSubtreeNode | null => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return null;

      const {
        isRoot,
        isOrphan,
        orphanAnchorY,
        needsLayout,
        editing,
        imageUploading,
        imageUrl,
        imagePublicId,
        ...restData
      } = node.data as Record<string, unknown>;

      const children = (childrenMap.get(id) ?? [])
        .map((cid) => buildSnapshot(cid))
        .filter((c): c is ClipboardSubtreeNode => c !== null);

      return {
        data: restData,
        image:
          imageUrl && imagePublicId
            ? { url: imageUrl as string, publicId: imagePublicId as string }
            : null,
        children,
      };
    };

    const snapshot = buildSnapshot(nodeId);
    if (snapshot) set({ clipboard: snapshot });
  },

  pasteNode: (mode, payload) => {
    get().pushHistory();
    const { clipboard, nodes, mindMapId } = get();
    if (!clipboard) return null;

    let rootPosition: { x: number; y: number };
    let parentId: string | null = null;

    if (mode === "child") {
      const targetId = payload as string;
      const parent = nodes.find((n) => n.id === targetId);
      if (!parent) return null;
      parentId = targetId;
      rootPosition = { x: parent.position.x, y: parent.position.y };
    } else {
      rootPosition = payload as { x: number; y: number };
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const imagesToUpload: { nodeId: string; sourceUrl: string }[] = [];

    const instantiate = (
      snap: ClipboardSubtreeNode,
      position: { x: number; y: number },
      parent: string | null,
      isRootOfPaste: boolean,
    ): string => {
      const id = crypto.randomUUID();

      const data: Record<string, unknown> = {
        ...snap.data,
        collapsed: false,
      };
      if (isRootOfPaste) {
        data.needsLayout = true;
        if (mode === "orphan") {
          data.isOrphan = true;
          data.orphanAnchorY = position.y;
        }
      }
      if (snap.image) {
        data.imageUploading = true;
        imagesToUpload.push({ nodeId: id, sourceUrl: snap.image.url });
      }

      newNodes.push({
        id,
        type: "mindmap",
        position,
        data,
        selected: isRootOfPaste,
      });

      if (parent) {
        newEdges.push({ id: `e-${parent}-${id}`, source: parent, target: id });
      }

      for (const child of snap.children) {
        instantiate(child, position, id, false);
      }

      return id;
    };

    const rootId = instantiate(clipboard, rootPosition, parentId, true);

    set((state) => ({
      nodes: [
        ...state.nodes.map((n) => ({ ...n, selected: false })),
        ...newNodes,
      ],
      edges: [...state.edges, ...newEdges],
    }));

    for (const { nodeId, sourceUrl } of imagesToUpload) {
      fetch("/api/upload/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, mindMapId, newNodeId: nodeId }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Duplicate gagal.");
          get().setNodeImage(nodeId, data.url, data.publicId);
        })
        .catch((err) => {
          console.error("Duplicate gambar gagal:", err);
          get().removeNodeImage(nodeId);
        });
    }

    return rootId;
  },

  orphanNode: (nodeId) => {
    get().pushHistory();
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
    get().pushHistory();

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

  selectAll: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({ ...n, selected: true })),
    }));
  },
}));
