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
import { buildChildrenMap } from "@/app/editor/[id]/lib/layoutEngine";
import type { CanvasTheme } from "@/app/editor/[id]/lib/themes";

export type SaveStatus = "idle" | "saving" | "saved";
export type DropZone = "before" | "after" | "child";

// Fix Bug #8 (+ varian addChild/addSibling): snapshot node yang masuk ke
// History SELALU di-strip `selected` (dan `imageUploading`) — biar undo/redo
// gak pernah nempelin balik state seleksi lama, yang kalau kejadian berkali-kali
// (delete/undo beruntun, atau add/redo beruntun) numpuk jadi banyak node
// ke-select bareng sekaligus.
function sanitizeNodeForHistory(node: Node): Node {
  const cleanedData = node.data?.imageUploading
    ? { ...node.data, imageUploading: false }
    : node.data;
  return { ...node, data: cleanedData, selected: false };
}

// Lapis 1 safety net: buang edge duplikat (by id) dan edge yang nyangkut ke
// node yang udah gak eksis. Dipanggil sebelum tiap `set({ edges: ... })` di
// undo/redo/applyRemoteUpdate biar state akhir selalu konsisten walau ada
// index/anchor-drift di skenario race ekstrem.
function sanitizeEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seenIds = new Set<string>();
  const result: Edge[] = [];
  for (const e of edges) {
    if (seenIds.has(e.id)) continue;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    seenIds.add(e.id);
    result.push(e);
  }
  return result;
}

// Fix Bug #5: kalau node yang lagi dihapus lewat undo/redo (removedNodeIds)
// punya child yang edge-nya BUKAN bagian dari ops history ini — berarti child
// itu ditambahin dari LUAR (misal tab lain, setelah op ini dicatat) — child itu
// JANGAN ikut kehapus diam-diam. Alih-alih, di-orphan-in (tetap ada di canvas,
// cuma lepas dari tree), sama kayak `orphanNode()`.
//
// Cukup cek 1 level (children LANGSUNG dari node yang dihapus). Subtree DI
// BAWAH child yang di-orphan-in itu otomatis aman tanpa perlu rekursi manual,
// karena edge-edge di bawahnya (child->cucu, dst) sama sekali gak tersentuh
// proses ini — tetap utuh nempel ke child yang sekarang jadi root orphan baru.
function orphanExternalChildren(
  nodes: Node[],
  edges: Edge[],
  removedNodeIds: string[],
): Node[] {
  const removedSet = new Set(removedNodeIds);
  const orphanCandidateIds = new Set(
    edges
      .filter((e) => removedSet.has(e.source) && !removedSet.has(e.target))
      .map((e) => e.target),
  );
  if (orphanCandidateIds.size === 0) return nodes;
  return nodes.map((n) =>
    orphanCandidateIds.has(n.id)
      ? {
          ...n,
          data: { ...n.data, isOrphan: true, orphanAnchorY: n.position.y },
        }
      : n,
  );
}

// Lapis 2: insert edge secara relatif terhadap id edge lain, bukan index
// absolut — tahan terhadap array yang berubah dari luar (applyRemoteUpdate)
// di antara waktu op dicatet dan waktu di-undo/redo.
function insertEdgeAfter(
  edges: Edge[],
  edge: Edge,
  afterId: string | null,
): Edge[] {
  if (afterId === null) return [edge, ...edges];
  const idx = edges.findIndex((e) => e.id === afterId);
  if (idx === -1) return [...edges, edge];
  const result = [...edges];
  result.splice(idx + 1, 0, edge);
  return result;
}

export interface ClipboardSubtreeNode {
  data: Record<string, unknown>;
  image: { url: string; publicId: string } | null;
  children: ClipboardSubtreeNode[];
}

type NodeOp =
  | { kind: "node"; type: "add"; node: Node }
  | { kind: "node"; type: "remove"; node: Node }
  | {
      kind: "node";
      type: "update";
      id: string;
      before: Partial<Node>;
      after: Partial<Node>;
    };

type EdgeOp =
  | { kind: "edge"; type: "add"; edge: Edge; afterId: string | null }
  | { kind: "edge"; type: "remove"; edge: Edge; afterId: string | null };

type HistoryOp = NodeOp | EdgeOp;

interface HistoryEntry {
  ops: HistoryOp[];
}

const MAX_HISTORY = 50;

function applyOpsForward(
  ops: HistoryOp[],
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  let newNodes = nodes;
  let newEdges = [...edges];

  for (const op of ops) {
    if (op.kind !== "node") continue;
    if (op.type === "add") newNodes = [...newNodes, op.node];
    else if (op.type === "remove")
      newNodes = newNodes.filter((n) => n.id !== op.node.id);
    else
      newNodes = newNodes.map((n) =>
        n.id === op.id ? { ...n, ...op.after } : n,
      );
  }

  for (const op of ops) {
    if (op.kind === "edge" && op.type === "remove") {
      newEdges = newEdges.filter((e) => e.id !== op.edge.id);
    }
  }

  for (const op of ops) {
    if (op.kind === "edge" && op.type === "add") {
      newEdges = insertEdgeAfter(newEdges, op.edge, op.afterId);
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

function applyOpsInverse(
  ops: HistoryOp[],
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  let newNodes = nodes;
  let newEdges = [...edges];

  for (const op of ops) {
    if (op.kind !== "node") continue;
    if (op.type === "add")
      newNodes = newNodes.filter((n) => n.id !== op.node.id);
    else if (op.type === "remove") newNodes = [...newNodes, op.node];
    else
      newNodes = newNodes.map((n) =>
        n.id === op.id ? { ...n, ...op.before } : n,
      );
  }

  for (const op of ops) {
    if (op.kind === "edge" && op.type === "add") {
      newEdges = newEdges.filter((e) => e.id !== op.edge.id);
    }
  }

  for (const op of ops) {
    if (op.kind === "edge" && op.type === "remove") {
      newEdges = insertEdgeAfter(newEdges, op.edge, op.afterId);
    }
  }

  return { nodes: newNodes, edges: newEdges };
}

interface MindMapStore {
  mindMapId: string;
  mindMapTitle: string;
  nodes: Node[];
  edges: Edge[];
  saveStatus: SaveStatus;
  clipboard: ClipboardSubtreeNode | null;
  canvasTheme: CanvasTheme;
  setCanvasTheme: (theme: CanvasTheme) => void;

  past: HistoryEntry[];
  future: HistoryEntry[];
  _pendingOps: HistoryOp[];
  _recordOps: (ops: HistoryOp[]) => void;
  _pendingRemovals: { nodeIds: string[]; edgeIds: string[] };
  _recordRemovals: (nodeIds: string[], edgeIds: string[]) => void;
  consumePendingRemovals: () => { nodeIds: string[]; edgeIds: string[] };
  commitHistory: () => void;
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
  applyRemoteUpdate: (nodes: Node[], edges: Edge[]) => void;
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
  _pendingOps: [],
  _pendingRemovals: { nodeIds: [], edgeIds: [] },

  _recordOps: (ops) => {
    if (ops.length === 0) return;
    set((state) => ({ _pendingOps: [...state._pendingOps, ...ops] }));
  },

  _recordRemovals: (nodeIds, edgeIds) => {
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    set((state) => ({
      _pendingRemovals: {
        nodeIds: [...state._pendingRemovals.nodeIds, ...nodeIds],
        edgeIds: [...state._pendingRemovals.edgeIds, ...edgeIds],
      },
    }));
  },

  // Fix Bug #1: validasi ulang buffer terhadap state TERKINI pas di-consume
  // (bukan pas di-tambah). Kalau id yang antre dihapus ternyata udah "hidup
  // lagi" sekarang (misal undo lalu redo dalam <300ms), coret dari batch
  // delete — jangan sampai kehapus padahal barusan dipakai lagi.
  consumePendingRemovals: () => {
    const { _pendingRemovals, nodes, edges } = get();
    set({ _pendingRemovals: { nodeIds: [], edgeIds: [] } });

    const currentNodeIds = new Set(nodes.map((n) => n.id));
    const currentEdgeIds = new Set(edges.map((e) => e.id));

    return {
      nodeIds: _pendingRemovals.nodeIds.filter((id) => !currentNodeIds.has(id)),
      edgeIds: _pendingRemovals.edgeIds.filter((id) => !currentEdgeIds.has(id)),
    };
  },

  commitHistory: () => {
    const { _pendingOps, past } = get();
    if (_pendingOps.length === 0) return;
    const entry: HistoryEntry = { ops: _pendingOps };
    const newPast = [...past, entry];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [], _pendingOps: [] });
  },

  undo: () => {
    const { past, nodes, edges, future } = get();
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const { nodes: rawNodes, edges: newEdges } = applyOpsInverse(
      entry.ops,
      nodes,
      edges,
    );

    const removedNodeIds = entry.ops
      .filter(
        (op): op is Extract<HistoryOp, { kind: "node"; type: "add" }> =>
          op.kind === "node" && op.type === "add",
      )
      .map((op) => op.node.id);
    const removedEdgeIds = entry.ops
      .filter(
        (op): op is Extract<HistoryOp, { kind: "edge"; type: "add" }> =>
          op.kind === "edge" && op.type === "add",
      )
      .map((op) => op.edge.id);

    // Fix Bug #5: node yang dihapus history lokal ini mungkin punya child
    // yang ditambahin dari LUAR history (tab lain) — orphan-in dulu sebelum
    // sanitizeEdges jalan, biar mereka gak ikut hilang diam-diam.
    const newNodes = orphanExternalChildren(rawNodes, newEdges, removedNodeIds);

    // Fix Bug #2: tangkep edge yang ikut disaring sanitizeEdges (orphan/
    // duplikat) biar ikut kehapus juga di Storage, bukan cuma di state lokal.
    const sanitizedEdges = sanitizeEdges(newNodes, newEdges);
    const sanitizedIds = new Set(sanitizedEdges.map((e) => e.id));
    const strippedEdgeIds = newEdges
      .filter((e) => !sanitizedIds.has(e.id))
      .map((e) => e.id);

    get()._recordRemovals(removedNodeIds, [
      ...removedEdgeIds,
      ...strippedEdgeIds,
    ]);

    set({
      past: newPast,
      future: [entry, ...future],
      nodes: newNodes,
      edges: sanitizedEdges,
    });
  },

  redo: () => {
    const { past, nodes, edges, future } = get();
    if (future.length === 0) return;
    const entry = future[0];
    const newFuture = future.slice(1);
    const { nodes: rawNodes, edges: newEdges } = applyOpsForward(
      entry.ops,
      nodes,
      edges,
    );

    const removedNodeIds = entry.ops
      .filter(
        (op): op is Extract<HistoryOp, { kind: "node"; type: "remove" }> =>
          op.kind === "node" && op.type === "remove",
      )
      .map((op) => op.node.id);
    const removedEdgeIds = entry.ops
      .filter(
        (op): op is Extract<HistoryOp, { kind: "edge"; type: "remove" }> =>
          op.kind === "edge" && op.type === "remove",
      )
      .map((op) => op.edge.id);

    // Fix Bug #5 (simetris sama undo): kalau di antara delete-nya di-undo dan
    // sekarang di-redo lagi, ada child baru numpang dari tab lain — orphan-in,
    // jangan ikut kehapus diam-diam.
    const newNodes = orphanExternalChildren(rawNodes, newEdges, removedNodeIds);

    const sanitizedEdges = sanitizeEdges(newNodes, newEdges);
    const sanitizedIds = new Set(sanitizedEdges.map((e) => e.id));
    const strippedEdgeIds = newEdges
      .filter((e) => !sanitizedIds.has(e.id))
      .map((e) => e.id);

    get()._recordRemovals(removedNodeIds, [
      ...removedEdgeIds,
      ...strippedEdgeIds,
    ]);

    set({
      past: [...past, entry],
      future: newFuture,
      nodes: newNodes,
      edges: sanitizedEdges,
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
      _pendingOps: [],
      _pendingRemovals: { nodeIds: [], edgeIds: [] },
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

    const afterId = edges.length > 0 ? edges[edges.length - 1].id : null;

    const ops: HistoryOp[] = [
      // Fix Bug #8 (varian addChild): strip `selected` dari snapshot supaya
      // redo berkali-kali gak numpuk banyak node ke-select bareng.
      { kind: "node", type: "add", node: sanitizeNodeForHistory(newNode) },
      { kind: "edge", type: "add", edge: newEdge, afterId },
    ];
    if (parent.data?.collapsed) {
      ops.push({
        kind: "node",
        type: "update",
        id: parentId,
        before: { data: parent.data },
        after: { data: { ...parent.data, collapsed: false } },
      });
    }

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

    get()._recordOps(ops);
    if (!_skipHistory) get().commitHistory();

    return id;
  },

  addSibling: (nodeId, _skipHistory) => {
    const { nodes, edges } = get();
    const selected = nodes.find((n) => n.id === nodeId);
    if (!selected) return null;

    const parentEdge = edges.find((e) => e.target === nodeId);
    if (!parentEdge || selected.data?.isRoot) {
      const newId = get().addChild(nodeId, true);
      if (!_skipHistory) get().commitHistory();
      return newId;
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

    const ops: HistoryOp[] = [
      // Fix Bug #8 (varian addSibling): sama kayak addChild.
      { kind: "node", type: "add", node: sanitizeNodeForHistory(newNode) },
      { kind: "edge", type: "add", edge: newEdge, afterId: parentEdge.id },
    ];

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

    get()._recordOps(ops);
    if (!_skipHistory) get().commitHistory();

    return id;
  },

  deleteSelected: () => {
    const { nodes, edges } = get();
    const toDelete = nodes.filter((n) => n.selected && !n.data?.isRoot);
    const childrenMap = buildChildrenMap(edges);
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
      const parentEdge = edges.find((e) => e.target === node.id);
      if (!parentEdge) continue;

      const parentId = parentEdge.source;
      const siblings = edges
        .filter((e) => e.source === parentId && !deletedIds.has(e.target))
        .map((e) => e.target);

      if (siblings.length > 0) {
        const allChildren = edges
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

    const removedNodes = nodes.filter((n) => deletedIds.has(n.id));
    const removedEdgeOps: HistoryOp[] = edges
      .map((e, index) => ({ e, index }))
      .filter(({ e }) => deletedIds.has(e.source) || deletedIds.has(e.target))
      .map(({ e, index }) => ({
        kind: "edge" as const,
        type: "remove" as const,
        edge: e,
        afterId: index > 0 ? edges[index - 1].id : null,
      }));

    const ops: HistoryOp[] = [
      ...removedNodes.map((node) => ({
        kind: "node" as const,
        type: "remove" as const,
        node: sanitizeNodeForHistory(node),
      })),
      ...removedEdgeOps,
    ];

    set((state) => ({
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
    }));

    get()._recordOps(ops);
    get()._recordRemovals(
      Array.from(deletedIds),
      edges
        .filter((e) => deletedIds.has(e.source) || deletedIds.has(e.target))
        .map((e) => e.id),
    );
    get().commitHistory();
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
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const before = { data: node.data };
    const after = { data: { ...node.data, ...style } };

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: after.data } : n,
      ),
    }));

    get()._recordOps([
      { kind: "node", type: "update", id: nodeId, before, after },
    ]);
    get().commitHistory();
  },

  updateNodeLabel: (nodeId, label) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const before = { data: { ...node.data, needsLayout: true } };
    const after = { data: { ...node.data, label, needsLayout: true } };

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: after.data } : n,
      ),
    }));

    get()._recordOps([
      { kind: "node", type: "update", id: nodeId, before, after },
    ]);
    get().commitHistory();
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  setNodeImage: (nodeId, url, publicId) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const before = {
      data: { ...node.data, imageUploading: false, needsLayout: true },
    };
    const after = {
      data: {
        ...node.data,
        imageUrl: url,
        imagePublicId: publicId,
        imageUploading: false,
        needsLayout: true,
      },
    };

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: after.data } : n,
      ),
    }));

    get()._recordOps([
      { kind: "node", type: "update", id: nodeId, before, after },
    ]);
    get().commitHistory();
  },

  removeNodeImage: (nodeId) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const { imageUrl, imagePublicId, imageUploading, ...restData } =
      node.data as Record<string, unknown>;
    const before = {
      data: { ...node.data, imageUploading: false, needsLayout: true },
    };
    const after = {
      data: { ...restData, imageUploading: false, needsLayout: true },
    };

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: after.data } : n,
      ),
    }));

    get()._recordOps([
      { kind: "node", type: "update", id: nodeId, before, after },
    ]);
    get().commitHistory();
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
    const { clipboard, nodes, edges, mindMapId } = get();
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

    const ops: HistoryOp[] = [
      ...newNodes.map((node) => ({
        kind: "node" as const,
        type: "add" as const,
        node: sanitizeNodeForHistory(node),
      })),
      ...newEdges.map((edge, i) => ({
        kind: "edge" as const,
        type: "add" as const,
        edge,
        afterId:
          i === 0
            ? edges.length > 0
              ? edges[edges.length - 1].id
              : null
            : newEdges[i - 1].id,
      })),
    ];

    set((state) => ({
      nodes: [
        ...state.nodes.map((n) => ({ ...n, selected: false })),
        ...newNodes,
      ],
      edges: [...state.edges, ...newEdges],
    }));

    get()._recordOps(ops);
    get().commitHistory();

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
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.data?.isRoot) return;

    const removedEdgeIndex = edges.findIndex((e) => e.target === nodeId);
    const removedEdge = removedEdgeIndex >= 0 ? edges[removedEdgeIndex] : null;
    const removedEdgeAfterId =
      removedEdgeIndex > 0 ? edges[removedEdgeIndex - 1].id : null;

    const before = { data: node.data };
    const after = {
      data: { ...node.data, isOrphan: true, orphanAnchorY: node.position.y },
    };

    const ops: HistoryOp[] = [];
    if (removedEdge) {
      ops.push({
        kind: "edge",
        type: "remove",
        edge: removedEdge,
        afterId: removedEdgeAfterId,
      });
    }
    ops.push({ kind: "node", type: "update", id: nodeId, before, after });

    set((state) => ({
      edges: state.edges.filter((e) => e.target !== nodeId),
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: after.data } : n,
      ),
    }));

    get()._recordOps(ops);
    if (removedEdge) get()._recordRemovals([], [removedEdge.id]);
    get().commitHistory();
  },

  commitDragDecision: (decision) => {
    if (decision.type === "BLOCK") return;
    const { edges } = get();

    if (decision.type === "REPARENT") {
      const oldEdgeIndex = edges.findIndex((e) => e.target === decision.dragId);
      const oldEdge = oldEdgeIndex >= 0 ? edges[oldEdgeIndex] : null;
      const newEdge: Edge = {
        id: `e-${decision.targetId}-${decision.dragId}`,
        source: decision.targetId,
        target: decision.dragId,
      };
      const filtered = edges.filter((e) => e.target !== decision.dragId);

      const ops: HistoryOp[] = [];
      if (oldEdge) {
        ops.push({
          kind: "edge",
          type: "remove",
          edge: oldEdge,
          afterId: oldEdgeIndex > 0 ? edges[oldEdgeIndex - 1].id : null,
        });
      }
      ops.push({
        kind: "edge",
        type: "add",
        edge: newEdge,
        afterId: filtered.length > 0 ? filtered[filtered.length - 1].id : null,
      });

      set(() => ({ edges: [...filtered, newEdge] }));

      get()._recordOps(ops);
      if (oldEdge && oldEdge.id !== newEdge.id) {
        get()._recordRemovals([], [oldEdge.id]);
      }
      get().commitHistory();
      return;
    }

    const oldEdgeIndex = edges.findIndex((e) => e.target === decision.dragId);
    const oldEdge = oldEdgeIndex >= 0 ? edges[oldEdgeIndex] : null;
    const filtered = edges.filter((e) => e.target !== decision.dragId);

    const ops: HistoryOp[] = [];
    if (oldEdge) {
      ops.push({
        kind: "edge",
        type: "remove",
        edge: oldEdge,
        afterId: oldEdgeIndex > 0 ? edges[oldEdgeIndex - 1].id : null,
      });
    }

    if (!decision.newParentId) {
      set(() => ({ edges: filtered }));
      get()._recordOps(ops);
      if (oldEdge) get()._recordRemovals([], [oldEdge.id]);
      get().commitHistory();
      return;
    }

    const newEdge = {
      id: `e-${decision.newParentId}-${decision.dragId}`,
      source: decision.newParentId,
      target: decision.dragId,
    };
    const targetEdgeIndex = filtered.findIndex(
      (e) => e.target === decision.targetId,
    );
    const afterId =
      decision.type === "REORDER_BEFORE"
        ? targetEdgeIndex > 0
          ? filtered[targetEdgeIndex - 1].id
          : null
        : (filtered[targetEdgeIndex]?.id ?? null);

    ops.push({ kind: "edge", type: "add", edge: newEdge, afterId });

    set(() => ({ edges: insertEdgeAfter(filtered, newEdge, afterId) }));
    get()._recordOps(ops);
    if (oldEdge && oldEdge.id !== newEdge.id) {
      get()._recordRemovals([], [oldEdge.id]);
    }
    get().commitHistory();
  },

  selectAll: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({ ...n, selected: true })),
    }));
  },

  // Fix Bug #3: preserve `measured` dari state lokal sebelumnya — Storage
  // gak nyimpen field ini (bukan Lson-serializable/emang gak perlu di-sync),
  // jadi kalau gak di-merge balik, applyRemoteUpdate bakal reset measured
  // SEMUA node ke undefined tiap kali sync masuk (termasuk pas reload).
  // Efeknya: relayout yang ke-trigger structureSignature langsung sesudahnya
  // kepaksa fallback ke height 40 buat node yang measured-nya ilang →
  // posisi salah → edge bengkok, dan gak sembuh sendiri karena gak ada
  // relayout susulan setelah React Flow selesai re-measure.
  //
  // Node yang beneran baru dari remote tetap gak punya measured (sama
  // kayak node baru hasil addChild/addSibling lokal) — itu bukan regresi,
  // itu behavior yang sudah ada & diterima untuk semua node baru.
  applyRemoteUpdate: (nodes, edges) => {
    const currentNodesMap = new Map(get().nodes.map((n) => [n.id, n]));
    const mergedNodes = nodes.map((n) => {
      const existing = currentNodesMap.get(n.id);
      // Kalau data-nya beneran berubah dari remote (referensi beda —
      // misal label/style diedit tab lain), measured lama yang kita
      // preserve di atas bisa jadi sedikit gak akurat (ukuran box lama,
      // padahal isinya baru). Tandain needsLayout: true supaya
      // handleNodesChange (jalur yang sama dipakai updateNodeLabel/
      // setNodeImage) otomatis relayout ulang begitu React Flow selesai
      // re-measure ukuran barunya — bukan nunggu aksi struktural lain.
      const dataChanged = existing && existing.data !== n.data;
      return {
        ...n,
        selected: existing?.selected ?? false,
        measured: existing?.measured,
        data: dataChanged ? { ...n.data, needsLayout: true } : n.data,
      };
    });
    set({ nodes: mergedNodes, edges: sanitizeEdges(mergedNodes, edges) });
  },
}));
