"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  PanOnScrollMode,
  useViewport,
  ControlButton,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, ChevronUp, Map as MapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import MindMapNode from "./MindMapNode";
import EditorToolbar from "./EditorToolbar";
import SearchOverlay from "./SearchOverlay";
import StyleSidebar from "./StyleSidebar";
import CustomEdge from "./CustomEdge";
import NodeContextMenu from "./NodeContextMenu";
import ManageAccessModal from "./ManageAccessModal";
import CollabRoomProvider from "./CollabRoomProvider";
import { useLiveblocksSync } from "./useLiveblocksSync";
import LiveCursors, { usePublishCursor } from "./LiveCursors";
import {
  useMindMapStore,
  type DropZone,
  type HistoryEntry,
} from "@/store/mindMapStore";
import {
  layoutForest,
  buildChildrenMap,
  buildParentMap,
  getDescendants,
  getAncestors,
  getHiddenNodeIds,
} from "@/app/editor/[id]/lib/layoutEngine";
import {
  hitTestDrag,
  decideDragAction,
  type DragDecision,
} from "@/app/editor/[id]/lib/dragEngine";
import { THEMES, type CanvasTheme } from "@/app/editor/[id]/lib/themes";
import { useThemeSync } from "./useThemeSync";

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { custom: CustomEdge };

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  mindMap: {
    id: string;
    title: string;
    content: unknown;
    canvasTheme: string;
  };
  role: "OWNER" | "EDITOR" | "VIEWER";
}

const CLIENT_MAX_DIMENSION = 2048; // sisi terpanjang
const CLIENT_QUALITY = 0.8;

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const longestSide = Math.max(img.width, img.height);
      const scale = Math.min(1, CLIENT_MAX_DIMENSION / longestSide);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas tidak didukung."));
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Gagal compress gambar."));
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
              type: "image/webp",
            }),
          );
        },
        "image/webp",
        CLIENT_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Gagal membaca gambar."));
    };

    img.src = objectUrl;
  });
}

function isPublicIdInHistory(
  publicId: string,
  entries: HistoryEntry[],
): boolean {
  for (const entry of entries) {
    for (const op of entry.ops) {
      if (op.kind !== "node") continue;
      if (op.type === "update") {
        const beforeId = (op.before.data as Record<string, unknown> | undefined)
          ?.imagePublicId;
        const afterId = (op.after.data as Record<string, unknown> | undefined)
          ?.imagePublicId;
        if (beforeId === publicId || afterId === publicId) return true;
      } else {
        const nodeId = (op.node.data as Record<string, unknown> | undefined)
          ?.imagePublicId;
        if (nodeId === publicId) return true;
      }
    }
  }
  return false;
}

export default function EditorClient({ mindMap, role }: Props) {
  const content = mindMap.content as { nodes: Node[]; edges: Edge[] };

  return (
    <CollabRoomProvider
      mindMapId={mindMap.id}
      initialNodes={content.nodes ?? []}
      initialEdges={content.edges ?? []}
      initialTheme={(mindMap.canvasTheme as CanvasTheme) ?? "dark"}
    >
      <ReactFlowProvider>
        <EditorCanvas mindMap={mindMap} role={role} />
      </ReactFlowProvider>
    </CollabRoomProvider>
  );
}

function EditorCanvas({ mindMap, role }: Props) {
  const router = useRouter();

  const init = useMindMapStore((s) => s.init);
  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const applyNodeChanges = useMindMapStore((s) => s.applyNodeChanges);
  const applyEdgeChanges = useMindMapStore((s) => s.applyEdgeChanges);
  const applyRemoteUpdate = useMindMapStore((s) => s.applyRemoteUpdate);
  const addChild = useMindMapStore((s) => s.addChild);
  const addSibling = useMindMapStore((s) => s.addSibling);
  const deleteSelected = useMindMapStore((s) => s.deleteSelected);
  const saveStatus = useMindMapStore((s) => s.saveStatus);
  const setSaveStatus = useMindMapStore((s) => s.setSaveStatus);
  const setNodeImage = useMindMapStore((s) => s.setNodeImage);
  const removeNodeImage = useMindMapStore((s) => s.removeNodeImage);
  const setNodeImageUploading = useMindMapStore((s) => s.setNodeImageUploading);
  const past = useMindMapStore((s) => s.past);
  const future = useMindMapStore((s) => s.future);

  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const { fitView, setNodes, flowToScreenPosition, screenToFlowPosition } =
    useReactFlow();
  const {
    onPointerMove: onCursorPointerMove,
    onPointerLeave: onCursorPointerLeave,
  } = usePublishCursor();
  useLiveblocksSync(nodes, edges, applyRemoteUpdate, role);
  const [dragDecision, setDragDecision] = useState<DragDecision | null>(null);
  const dragOriginRef = useRef<{
    id: string;
    position: { x: number; y: number };
  } | null>(null);
  const lastClickedCanvasPos = useRef<{ x: number; y: number } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [mouseScreenPos, setMouseScreenPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [draggingNodeData, setDraggingNodeData] = useState<{
    label: string;
    bgColor: string;
    borderColor: string;
    isRoot: boolean;
    measuredWidth: number;
    measuredHeight: number;
  } | null>(null);
  // Fase 2 — Hysteresis: simpan target aktif dari frame sebelumnya
  const previousTargetRef = useRef<string | null>(null);
  const commitDragDecision = useMindMapStore((s) => s.commitDragDecision);
  const orphanNode = useMindMapStore((s) => s.orphanNode);
  const copyNode = useMindMapStore((s) => s.copyNode);
  const pasteNode = useMindMapStore((s) => s.pasteNode);
  const selectAll = useMindMapStore((s) => s.selectAll);
  const undo = useMindMapStore((s) => s.undo);
  const redo = useMindMapStore((s) => s.redo);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);
  const commitHistory = useMindMapStore((s) => s.commitHistory);
  const { zoom } = useViewport();
  const canvasTheme = useMindMapStore((s) => s.canvasTheme);
  const setCanvasTheme = useMindMapStore((s) => s.setCanvasTheme);
  const canEdit = role !== "VIEWER";
  const { pushTheme } = useThemeSync(canvasTheme, setCanvasTheme, role);
  const theme = THEMES[canvasTheme];
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // ===== CONTEXT MENU =====
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageNodeId = useRef<string | null>(null);
  const [focusedImageNodeId, setFocusedImageNodeId] = useState<string | null>(
    null,
  );

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    useMindMapStore.setState((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === node.id,
      })),
    }));
    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleInsertImageClick = useCallback(() => {
    if (!contextMenu) return;
    pendingImageNodeId.current = contextMenu.nodeId;
    imageInputRef.current?.click();
  }, [contextMenu]);

  const handleCopyFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    useMindMapStore.getState().copyNode(contextMenu.nodeId);
  }, [contextMenu]);

  const handlePasteFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    const newRootId = useMindMapStore
      .getState()
      .pasteNode("child", contextMenu.nodeId);
    if (newRootId) requestAnimationFrame(() => runLayout(newRootId));
  }, [contextMenu]);

  const clipboard = useMindMapStore((s) => s.clipboard);

  const pendingImageDeletesRef = useRef<Set<string>>(new Set());

  const deletePublicIdFromCloudinary = useCallback((publicId: string) => {
    fetch("/api/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId }),
    }).catch((err) => console.error("Hapus gambar gagal:", err));
  }, []);

  const scheduleImageDelete = useCallback((publicId: string) => {
    pendingImageDeletesRef.current.add(publicId);
  }, []);

  // Cuma hapus beneran ke Cloudinary kalau publicId udah gak reachable lewat
  // undo (past) maupun redo (future) — bukan estimasi waktu (setTimeout).
  // Efek ini re-check tiap kali history berubah (commit baru, undo, redo,
  // atau MAX_HISTORY eviction).
  useEffect(() => {
    const pending = pendingImageDeletesRef.current;
    for (const publicId of Array.from(pending)) {
      const isCurrentlyUsed = nodes.some(
        (n) =>
          (n.data as Record<string, unknown> | undefined)?.imagePublicId ===
          publicId,
      );
      const stillReachable =
        isCurrentlyUsed ||
        isPublicIdInHistory(publicId, past) ||
        isPublicIdInHistory(publicId, future);
      if (!stillReachable) {
        pending.delete(publicId);
        deletePublicIdFromCloudinary(publicId);
      }
    }
  }, [nodes, past, future, deletePublicIdFromCloudinary]);

  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const nodeId = pendingImageNodeId.current;
      // Reset input value supaya bisa pilih file yang sama lagi nanti
      e.target.value = "";
      pendingImageNodeId.current = null;

      if (!file || !nodeId) return;

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        alert("Format file harus JPG, PNG, atau WebP.");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        alert("Ukuran file maksimal 10MB.");
        return;
      }

      // Simpan publicId gambar lama (kalau ada) sebelum ke-overwrite di store
      const { nodes: nodesBeforeUpload } = useMindMapStore.getState();
      const oldPublicId = nodesBeforeUpload.find((n) => n.id === nodeId)?.data
        ?.imagePublicId as string | undefined;

      setNodeImageUploading(nodeId, true);

      try {
        const compressedFile = await compressImage(file);

        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("mindMapId", mindMap.id);
        formData.append("nodeId", nodeId);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Upload gagal.");
        }

        setNodeImage(nodeId, data.url, data.publicId);

        // Gambar baru udah sukses dipasang — jadwalkan cleanup gambar lama,
        // baru beneran dihapus kalau udah gak reachable lewat undo/redo.
        if (oldPublicId && oldPublicId !== data.publicId) {
          scheduleImageDelete(oldPublicId);
        }
      } catch (err) {
        console.error("Upload gambar gagal:", err);
        alert(err instanceof Error ? err.message : "Upload gagal, coba lagi.");
        setNodeImageUploading(nodeId, false);
      }
    },
    [mindMap.id, setNodeImage, setNodeImageUploading],
  );

  const handleRemoveImage = useCallback(
    (nodeId: string) => {
      const { nodes: latestNodes } = useMindMapStore.getState();
      const node = latestNodes.find((n) => n.id === nodeId);
      const publicId = node?.data?.imagePublicId as string | undefined;
      if (!publicId) return;

      removeNodeImage(nodeId);
      scheduleImageDelete(publicId);
    },
    [removeNodeImage, scheduleImageDelete],
  );

  // Fire-and-forget cleanup Cloudinary untuk banyak node sekaligus (dipakai
  // saat delete node yang punya descendant dengan gambar). Gak menyentuh
  // store karena node-nya toh langsung dihapus oleh deleteSelected().
  const cleanupImagesForNodes = useCallback(
    (nodeIds: string[]) => {
      const { nodes: latestNodes } = useMindMapStore.getState();
      for (const id of nodeIds) {
        const node = latestNodes.find((n) => n.id === id);
        const publicId = node?.data?.imagePublicId as string | undefined;
        if (!publicId) continue;
        scheduleImageDelete(publicId);
      }
    },
    [scheduleImageDelete],
  );

  const handleImageFocus = useCallback((nodeId: string) => {
    useMindMapStore.setState((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    }));
    setFocusedImageNodeId(nodeId);
  }, []);

  const handleToggleCollapse = useCallback(
    (nodeId: string) => {
      requestAnimationFrame(() => {
        fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: zoom });
      });
    },
    [fitView, zoom],
  );

  const handleThemeChange = useCallback(
    (newTheme: CanvasTheme) => {
      setCanvasTheme(newTheme);
      pushTheme(newTheme);
      fetch(`/api/mindmaps/${mindMap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasTheme: newTheme }),
      }).catch((err) => console.error("Simpan theme gagal:", err));
    },
    [mindMap.id, setCanvasTheme, pushTheme],
  );

  // Dipanggil langsung dari MindMapNode saat gambar selesai render (onLoad
  // atau cache-hit). Sengaja gak lewat flag needsLayout + dimension event,
  // karena timingnya racy (ResizeObserver bisa fire sebelum flag nyala).
  const handleImageSettled = useCallback(() => {
    requestAnimationFrame(() => runLayout());
  }, []);

  // ===== END CONTEXT MENU =====

  const handleAddChild = useCallback(
    (nodeId: string) => {
      if (!canEdit) return;
      const newId = addChild(nodeId);
      if (newId) requestAnimationFrame(() => runLayout(newId));
    },
    [addChild, canEdit],
  );
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    useMindMapStore.setState((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === node.id,
      })),
    }));
    setFocusedImageNodeId(null);
  }, []);

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      useMindMapStore.setState((state) => ({
        nodes: state.nodes.map((n) => ({ ...n, selected: false })),
      }));
      setFocusedImageNodeId(null);
      lastClickedCanvasPos.current = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
    },
    [screenToFlowPosition],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges(changes);

      // Cuma track node yang dimensinya BENERAN berubah di batch ini —
      // bukan semua node yang needsLayout secara global. Ini penting karena
      // resize node (misal paste teks multiline panjang) bisa trigger
      // beberapa event dimension berturut-turut sebelum settle ke ukuran final.
      const dimensionChangedIds = new Set(
        changes.filter((c) => c.type === "dimensions").map((c) => c.id),
      );
      if (dimensionChangedIds.size === 0) return;

      const { nodes: latestNodes } = useMindMapStore.getState();
      const relevantNeedsLayout = latestNodes.some(
        (n) => dimensionChangedIds.has(n.id) && n.data?.needsLayout,
      );
      if (!relevantNeedsLayout) return;

      useMindMapStore.setState((state) => ({
        nodes: state.nodes.map((n) =>
          dimensionChangedIds.has(n.id) && n.data?.needsLayout
            ? { ...n, data: { ...n.data, needsLayout: false } }
            : n,
        ),
      }));

      requestAnimationFrame(() => {
        const { nodes: freshNodes, edges: freshEdges } =
          useMindMapStore.getState();
        const cMap = buildChildrenMap(freshEdges);
        const hidden = getHiddenNodeIds(freshNodes, cMap);
        const positions = layoutForest(freshNodes, freshEdges, cMap, hidden);

        useMindMapStore.setState((state) => ({
          nodes: state.nodes.map((n) => {
            const pos = positions.get(n.id);
            return pos ? { ...n, position: pos } : n;
          }),
        }));
      });
    },
    [applyNodeChanges],
  );

  const handleAddSibling = useCallback(
    (nodeId: string) => {
      if (!canEdit) return;
      const newId = addSibling(nodeId);
      if (newId) requestAnimationFrame(() => runLayout(newId));
    },
    [addSibling, canEdit],
  );

  function runLayout(focusNodeId?: string) {
    const { nodes: latestNodes, edges: latestEdges } =
      useMindMapStore.getState();
    const cMap = buildChildrenMap(latestEdges);
    const hidden = getHiddenNodeIds(latestNodes, cMap);
    const positions = layoutForest(latestNodes, latestEdges, cMap, hidden);

    // Update posisi + selection langsung di store, bukan via setNodes
    useMindMapStore.setState((state) => ({
      nodes: state.nodes.map((n) => {
        const pos = positions.get(n.id);
        return {
          ...n,
          position: pos ?? n.position,
          selected: focusNodeId ? n.id === focusNodeId : n.selected,
        };
      }),
    }));

    if (focusNodeId) {
      requestAnimationFrame(() => {
        fitView({ nodes: [{ id: focusNodeId }], duration: 300, maxZoom: zoom });
      });
    }
  }

  useEffect(() => {
    const content = mindMap.content as { nodes: Node[]; edges: Edge[] };
    init(
      mindMap.id,
      mindMap.title,
      content.nodes ?? [],
      content.edges ?? [],
      (mindMap.canvasTheme as CanvasTheme) ?? "dark",
    );
  }, [mindMap.id]);

  // Autosave
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // VIEWER gak boleh nulis (backend nolak PATCH dengan 404 by design) —
    // skip autosave sama sekali biar gak spam request gagal.
    if (role === "VIEWER") {
      return;
    }

    setSaveStatus("saving");

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        await fetch(`/api/mindmaps/${mindMap.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { nodes, edges } }),
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Autosave gagal:", err);
        setSaveStatus("idle");
      }
    }, 1500);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [nodes, edges, mindMap.id, role]);

  // Derived maps — pakai layout engine
  const childrenMap = useMemo(() => buildChildrenMap(edges), [edges]);
  const parentMap = useMemo(() => buildParentMap(edges), [edges]);
  const hiddenNodeIds = useMemo(
    () => getHiddenNodeIds(nodes, childrenMap),
    [nodes, childrenMap],
  );

  const structureSignature = useMemo(() => {
    // Group edges by source, sort children per parent (bukan global sort)
    const grouped = new Map<string, string[]>();
    edges.forEach((e) => {
      if (!grouped.has(e.source)) grouped.set(e.source, []);
      grouped.get(e.source)!.push(e.target);
    });

    // Sort keys supaya antar parent stable, tapi urutan children dipertahankan
    const edgeSig = [...grouped.keys()]
      .sort()
      .map((src) => `${src}:[${grouped.get(src)!.join(",")}]`)
      .join("|");

    const collapsedSig = nodes
      .filter((n) => n.data?.collapsed)
      .map((n) => n.id)
      .sort()
      .join(",");

    return `${edgeSig}|${collapsedSig}`;
  }, [edges, nodes]);

  useEffect(() => {
    const { nodes: latestNodes, edges: latestEdges } =
      useMindMapStore.getState();
    const cMap = buildChildrenMap(latestEdges);
    const hidden = getHiddenNodeIds(latestNodes, cMap);
    const positions = layoutForest(latestNodes, latestEdges, cMap, hidden);

    useMindMapStore.setState((state) => ({
      nodes: state.nodes.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    }));
  }, [structureSignature]);

  function onNodeDragStart(_: MouseEvent | TouchEvent, node: Node) {
    if (!canEdit) return;
    if (node.data?.isRoot) return;
    dragOriginRef.current = { id: node.id, position: { ...node.position } };
    previousTargetRef.current = null;

    // Shadow node
    setDraggingNodeId(node.id);
    setDraggingNodeData({
      label: node.data.label as string,
      bgColor: (node.data.bgColor as string) || "#FFFFFF",
      borderColor: (node.data.borderColor as string) || "#D1D5DB",
      isRoot: !!node.data.isRoot,
      measuredWidth: node.measured?.width ?? 150,
      measuredHeight: node.measured?.height ?? 40,
    });
  }

  function onNodeDrag(e: MouseEvent | TouchEvent, node: Node) {
    if (!canEdit) return;
    if (node.data?.isRoot) return;

    // Update posisi mouse
    const clientX = "clientX" in e ? e.clientX : e.touches[0].clientX;
    const clientY = "clientY" in e ? e.clientY : e.touches[0].clientY;
    setMouseScreenPos({ x: clientX, y: clientY });

    if (dragOriginRef.current) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, position: dragOriginRef.current!.position }
            : n,
        ),
      );
    }

    // Konversi posisi mouse ke flow coordinates
    const mouseFlowPos = screenToFlowPosition({ x: clientX, y: clientY });
    const nodeWidth = node.measured?.width ?? 150;
    const nodeHeight = node.measured?.height ?? 40;
    const dragRect = {
      x: mouseFlowPos.x - nodeWidth / 2,
      y: mouseFlowPos.y - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight,
    };
    // ... sisa kode onNodeDrag yang sudah ada ...
    const candidates = nodes.filter(
      (n) => n.id !== node.id && !hiddenNodeIds.has(n.id),
    );
    const hit = hitTestDrag(
      node,
      candidates,
      previousTargetRef.current,
      dragRect,
    );
    if (!hit) {
      previousTargetRef.current = null;
      setDragDecision(null);
      return;
    }
    previousTargetRef.current = hit.targetId;
    const decision = decideDragAction(
      node.id,
      hit.targetId,
      hit.zone,
      nodes,
      edges,
    );
    setDragDecision(decision);
  }

  function onNodeDragStop(_: MouseEvent | TouchEvent, node: Node) {
    if (!canEdit) return;
    if (node.data?.isRoot) return;

    // Clear shadow
    setDraggingNodeId(null);
    setMouseScreenPos(null);
    setDraggingNodeData(null);

    const origin = dragOriginRef.current;
    const decision = dragDecision;
    dragOriginRef.current = null;
    // Reset hysteresis ref saat drag selesai
    previousTargetRef.current = null;
    setDragDecision(null);

    if (!origin || origin.id !== node.id) return;

    const moved =
      Math.abs(node.position.x - origin.position.x) > 5 ||
      Math.abs(node.position.y - origin.position.y) > 5;
    if (!moved) return;

    // sesudah
    if (decision && decision.type === "BLOCK") {
      // Balik ke posisi semula
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id ? { ...n, position: origin.position } : n,
        ),
      );
      return;
    } else if (decision) {
      // Hapus isOrphan flag sebelum commit — HARUS lewat Zustand store
      useMindMapStore.setState((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === decision.dragId
            ? { ...n, data: { ...n.data, isOrphan: false } }
            : n,
        ),
      }));
      commitDragDecision(decision);
    } else {
      // Node di-drag tapi gak nge-hit target manapun.
      if (node.data?.isOrphan) {
        // Udah orphan sebelumnya, cuma digeser-geser — update anchor-nya
        // biar posisi baru gak ke-reset balik pas relayout, LALU lanjut relayout
        // children-nya biar ikut ngikutin posisi baru.
        useMindMapStore.setState((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === node.id
              ? { ...n, data: { ...n.data, orphanAnchorY: node.position.y } }
              : n,
          ),
        }));
      } else {
        // Belum orphan — jadiin orphan baru, gak perlu layout tambahan
        // karena orphanNode() sendiri gak nambah/ubah children.
        orphanNode(node.id);
        return;
      }
    }

    const { nodes: latestNodes, edges: latestEdges } =
      useMindMapStore.getState();
    const cMap = buildChildrenMap(latestEdges);
    const hidden = getHiddenNodeIds(latestNodes, cMap);
    const positions = layoutForest(latestNodes, latestEdges, cMap, hidden);

    useMindMapStore.setState((state) => ({
      nodes: state.nodes.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    }));
  }

  // ===== SEARCH =====
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const source = q
      ? nodes.filter((n) => (n.data.label as string)?.toLowerCase().includes(q))
      : nodes;
    return source.map((n) => ({ id: n.id, label: n.data.label as string }));
  }, [nodes, searchQuery]);

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setCurrentMatchIndex(-1);
  }

  function focusNode(nodeId: string) {
    const ancestors = getAncestors(nodeId, parentMap);
    const hasCollapsedAncestor = ancestors.some((aid) => {
      const n = nodes.find((nn) => nn.id === aid);
      return n?.data?.collapsed;
    });

    if (hasCollapsedAncestor) {
      setNodes((nds) =>
        nds.map((n) =>
          ancestors.includes(n.id) && n.data?.collapsed
            ? { ...n, data: { ...n.data, collapsed: false } }
            : n,
        ),
      );
    }

    setPendingFocusId(nodeId);
  }

  useEffect(() => {
    if (!pendingFocusId) return;
    if (hiddenNodeIds.has(pendingFocusId)) return;
    fitView({ nodes: [{ id: pendingFocusId }], duration: 600, maxZoom: 1.5 });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset trigger flag setelah manggil fitView (sistem eksternal), bukan derived state; refactor ke luar effect beresiko break timing fitView
    setPendingFocusId(null);
  }, [pendingFocusId, hiddenNodeIds, fitView]);

  function goToNextMatch() {
    if (matches.length === 0) return;
    const nextIndex =
      currentMatchIndex < matches.length - 1 ? currentMatchIndex + 1 : 0;
    setCurrentMatchIndex(nextIndex);
    focusNode(matches[nextIndex].id);
  }

  function goToPrevMatch() {
    if (matches.length === 0) return;
    const prevIndex =
      currentMatchIndex > 0 ? currentMatchIndex - 1 : matches.length - 1;
    setCurrentMatchIndex(prevIndex);
    focusNode(matches[prevIndex].id);
  }

  function selectMatch(index: number) {
    setCurrentMatchIndex(index);
    focusNode(matches[index].id);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIndex(-1);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isFindShortcut =
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
      if (isFindShortcut) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape" && searchOpen) {
        closeSearch();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  const activeMatchId =
    currentMatchIndex >= 0 ? matches[currentMatchIndex]?.id : null;
  const matchIds = useMemo(() => matches.map((m) => m.id), [matches]);
  // ===== END SEARCH =====

  const ghostNode = useMemo<Node | null>(() => {
    if (!dragDecision || dragDecision.type === "BLOCK") return null;

    // Simulasi edges hasil commit (tanpa mutasi store)
    let simEdges = edges.filter((e) => e.target !== dragDecision.dragId);
    if (dragDecision.type === "REPARENT") {
      simEdges = [
        ...simEdges,
        {
          id: `ghost-edge`,
          source: dragDecision.targetId,
          target: dragDecision.dragId,
        },
      ];
    } else {
      const newParentId = dragDecision.newParentId;
      if (newParentId) {
        const targetIdx = simEdges.findIndex(
          (e) => e.target === dragDecision.targetId,
        );
        const insertIdx =
          dragDecision.type === "REORDER_BEFORE" ? targetIdx : targetIdx + 1;
        const newEdge = {
          id: `ghost-edge`,
          source: newParentId,
          target: dragDecision.dragId,
        };
        simEdges.splice(insertIdx, 0, newEdge);
      }
    }

    const simChildrenMap = buildChildrenMap(simEdges);
    const positions = layoutForest(
      nodes,
      simEdges,
      simChildrenMap,
      hiddenNodeIds,
    );
    const pos = positions.get(dragDecision.dragId);
    if (!pos) return null;

    return {
      id: "__ghost__",
      type: "mindmap",
      position: pos,
      data: {
        label:
          nodes.find((n) => n.id === dragDecision.dragId)?.data.label ?? "",
        isGhost: true,
      },
      draggable: false,
      selectable: false,
      focusable: false,
    };
  }, [dragDecision, edges, nodes, hiddenNodeIds]);

  const ghostEdgePath = useMemo(() => {
    if (!dragDecision || dragDecision.type === "BLOCK" || !ghostNode)
      return null;

    const parentId =
      dragDecision.type === "REPARENT"
        ? dragDecision.targetId
        : dragDecision.newParentId;

    if (!parentId) return null;

    const parentNode = nodes.find((n) => n.id === parentId);
    if (!parentNode) return null;

    const parentWidth = parentNode.measured?.width ?? 150;
    const parentHeight = parentNode.measured?.height ?? 40;
    const TOOLBAR_OFFSET = 44;
    const GHOST_W = 60;
    const GHOST_H = 20;
    const GHOST_GAP = 9 * zoom;

    const parentRaw = flowToScreenPosition({
      x: parentNode.position.x + parentWidth,
      y: parentNode.position.y + parentHeight / 2,
    });
    const x1 = parentRaw.x;
    const y1 = parentRaw.y - TOOLBAR_OFFSET;

    const targetNode = nodes.find((n) => n.id === dragDecision.targetId);
    const targetPos = flowToScreenPosition(
      targetNode?.position ?? { x: 0, y: 0 },
    );
    const targetHeight = (targetNode?.measured?.height ?? 40) * zoom;

    let ghostLeft: number;
    let ghostTop: number;

    if (dragDecision.type === "REPARENT") {
      const pos = flowToScreenPosition(ghostNode.position);
      ghostTop = pos.y - TOOLBAR_OFFSET;
      ghostLeft = pos.x;
    } else if (dragDecision.type === "REORDER_BEFORE") {
      ghostTop = targetPos.y - GHOST_GAP - GHOST_H - TOOLBAR_OFFSET;
      ghostLeft = targetPos.x;
    } else {
      ghostTop = targetPos.y + targetHeight + GHOST_GAP - TOOLBAR_OFFSET;
      ghostLeft = targetPos.x;
    }

    const x2 = ghostLeft;
    const y2 = ghostTop + GHOST_H / 2;

    const STUB = 20 * zoom;
    const SEGMENT = 9 * zoom;
    const stubX = x1 + STUB;
    const mx2 = x2 - SEGMENT;
    const dx = mx2 - stubX;
    const cx1 = stubX + dx / 2;
    const cy1 = y1;
    const cx2 = mx2 - dx / 2;
    const cy2 = y2;

    return `M${x1},${y1} L${stubX},${y1} C${cx1},${cy1} ${cx2},${cy2} ${mx2},${y2} L${x2},${y2}`;
  }, [dragDecision, ghostNode, nodes, flowToScreenPosition, zoom]);

  const rootId = useMemo(
    () => nodes.find((n) => n.data?.isRoot)?.id ?? null,
    [nodes],
  );

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      let previewZone: "before" | "after" | "child" | "blocked" | null = null;

      if (dragDecision && dragDecision.targetId === n.id) {
        previewZone =
          dragDecision.type === "REPARENT"
            ? "child"
            : dragDecision.type === "REORDER_BEFORE"
              ? "before"
              : dragDecision.type === "REORDER_AFTER"
                ? "after"
                : "blocked";
      }

      return {
        ...n,
        hidden: hiddenNodeIds.has(n.id),
        draggable: !n.data?.isRoot && canEdit,
        style: draggingNodeId === n.id ? { opacity: 0.3 } : undefined,
        data: {
          ...n.data,
          childCount: getDescendants(n.id, childrenMap).length,
          searchMatch: matchIds.includes(n.id),
          searchActive: n.id === activeMatchId,
          dropZone: previewZone,
          isDirectChildOfRoot: rootId ? parentMap.get(n.id) === rootId : false,
          onAddChild: handleAddChild,
          onAddSibling: handleAddSibling,
          imageFocused: n.id === focusedImageNodeId,
          onImageFocus: handleImageFocus,
          onImageSettled: handleImageSettled,
          onLabelChange: updateNodeLabel,
          onToggleCollapse: handleToggleCollapse,
          canvasTheme: canvasTheme,
          canEdit,
        },
      };
    });
  }, [
    nodes,
    hiddenNodeIds,
    childrenMap,
    matchIds,
    activeMatchId,
    dragDecision,
    focusedImageNodeId,
    handleImageFocus,
    handleImageSettled,
    handleImageSettled,
    theme,
    canEdit,
  ]);

  const displayEdges = useMemo(() => {
    return edges.map((e) => ({
      ...e,
      hidden: hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target),
    }));
  }, [edges, hiddenNodeIds]);

  const dynamicTranslateExtent = useMemo<
    [[number, number], [number, number]]
  >(() => {
    const MARGIN = 2000;
    if (nodes.length === 0) {
      return [
        [-2000, -2000],
        [12000, 10000],
      ];
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of nodes) {
      const w = n.measured?.width ?? 150;
      const h = n.measured?.height ?? 40;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    return [
      [minX - MARGIN, minY - MARGIN],
      [maxX + MARGIN, maxY + MARGIN],
    ];
  }, [nodes]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!canEdit) return;
        if (e.repeat) return;
        e.preventDefault();
        undo();
        return;
      }
      if (isCtrlOrCmd && e.key.toLowerCase() === "z" && e.shiftKey) {
        if (!canEdit) return;
        if (e.repeat) return;
        e.preventDefault();
        redo();
        return;
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === "c") {
        if (focusedImageNodeId) return;
        const { nodes: latestNodes } = useMindMapStore.getState();
        const selected = latestNodes.find((n) => n.selected);
        if (!selected) return;
        e.preventDefault();
        copyNode(selected.id);
        return;
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === "v") {
        if (!canEdit) return;
        if (focusedImageNodeId) return;
        const { clipboard, nodes: latestNodes } = useMindMapStore.getState();
        if (!clipboard) return;
        e.preventDefault();

        const selected = latestNodes.find((n) => n.selected);
        let newRootId: string | null = null;

        if (selected) {
          newRootId = pasteNode("child", selected.id);
        } else if (lastClickedCanvasPos.current) {
          newRootId = pasteNode("orphan", lastClickedCanvasPos.current);
        } else {
          return;
        }

        if (newRootId) requestAnimationFrame(() => runLayout(newRootId!));
        return;
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === "a") {
        if (focusedImageNodeId) return;
        e.preventDefault();
        selectAll();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!canEdit) return;
        const { nodes: latestNodes } = useMindMapStore.getState();
        const selected = latestNodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        e.preventDefault();

        // Image lagi fokus → hapus image aja (single node context)
        const primarySelected =
          selected.find((n) => n.id === focusedImageNodeId) ??
          selected.find((n) => !n.data?.isRoot) ??
          null;
        if (focusedImageNodeId && primarySelected?.data?.imageUrl) {
          handleRemoveImage(primarySelected.id);
          setFocusedImageNodeId(null);
          return;
        }

        // Kalau semua yang selected cuma root → skip
        const nonRootSelected = selected.filter((n) => !n.data?.isRoot);
        if (nonRootSelected.length === 0) return;

        // Hapus node — kumpulin selected + semua descendant-nya (sama persis
        // logic cascade di store deleteSelected), lalu cleanup Cloudinary
        // buat semua yang punya gambar (fire-and-forget)
        const { edges: latestEdges } = useMindMapStore.getState();
        const cMapForDelete = buildChildrenMap(latestEdges);
        const idsToClean: string[] = [];
        const stack: string[] = [];
        for (const node of nonRootSelected) {
          idsToClean.push(node.id);
          stack.push(...(cMapForDelete.get(node.id) ?? []));
        }
        while (stack.length > 0) {
          const cid = stack.pop()!;
          idsToClean.push(cid);
          stack.push(...(cMapForDelete.get(cid) ?? []));
        }
        cleanupImagesForNodes(idsToClean);

        setFocusedImageNodeId(null);
        deleteSelected();
        requestAnimationFrame(() => {
          const { nodes: afterNodes } = useMindMapStore.getState();
          const focusedNodes = afterNodes.filter((n) => n.selected);
          if (focusedNodes.length > 0) {
            fitView({
              nodes: focusedNodes.map((n) => ({ id: n.id })),
              duration: 300,
              maxZoom: zoom,
            });
          }
        });
        return;
      }

      if (e.key === "Enter") {
        if (!canEdit) return;
        if (focusedImageNodeId || e.repeat) return;
        e.preventDefault();
        const { nodes: latestNodes } = useMindMapStore.getState();
        const selectedNodes = latestNodes.filter((n) => n.selected);
        if (selectedNodes.length === 0) return;
        const newIds: string[] = [];
        for (const node of selectedNodes) {
          if (node.data?.isRoot) continue;
          const newId = addSibling(node.id, true);
          if (newId) newIds.push(newId);
        }
        commitHistory();
        if (newIds.length > 0) {
          requestAnimationFrame(() => {
            runLayout();
            // Set semua node baru ke selected
            useMindMapStore.setState((state) => ({
              nodes: state.nodes.map((n) => ({
                ...n,
                selected: newIds.includes(n.id),
              })),
            }));
            requestAnimationFrame(() => {
              fitView({
                nodes: newIds.map((id) => ({ id })),
                duration: 300,
                maxZoom: zoom,
              });
            });
          });
        }
        return;
      }

      if (e.key === "Tab") {
        if (!canEdit) return;
        if (focusedImageNodeId || e.repeat) return;
        e.preventDefault();
        const { nodes: latestNodes } = useMindMapStore.getState();
        const selectedNodes = latestNodes.filter((n) => n.selected);
        if (selectedNodes.length === 0) return;
        const newIds: string[] = [];
        for (const node of selectedNodes) {
          const newId = addChild(node.id, true);
          if (newId) newIds.push(newId);
        }
        commitHistory();
        if (newIds.length > 0) {
          requestAnimationFrame(() => {
            runLayout();
            // Set semua node baru ke selected
            useMindMapStore.setState((state) => ({
              nodes: state.nodes.map((n) => ({
                ...n,
                selected: newIds.includes(n.id),
              })),
            }));
            requestAnimationFrame(() => {
              fitView({
                nodes: newIds.map((id) => ({ id })),
                duration: 300,
                maxZoom: zoom,
              });
            });
          });
        }
        return;
      }

      if (e.key === " ") {
        if (!canEdit) return;
        if (focusedImageNodeId) return;
        const { nodes: latestNodes } = useMindMapStore.getState(); // ← fresh
        const selected = latestNodes.find((n) => n.selected) ?? null;
        if (!selected) return;
        e.preventDefault();
        setNodes((nds) =>
          nds.map((n) =>
            n.id === selected.id
              ? { ...n, data: { ...n.data, editing: true } }
              : n,
          ),
        );
        return;
      }

      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        if (focusedImageNodeId) return;
        const { nodes: latestNodes, edges: latestEdges } =
          useMindMapStore.getState();
        const selected = latestNodes.find((n) => n.selected);
        if (!selected) return;
        e.preventDefault();

        const pMap = buildParentMap(latestEdges);
        const cMap = buildChildrenMap(latestEdges);

        let targetId: string | null = null;

        if (e.key === "ArrowLeft") {
          if (selected.data?.isRoot) return;
          targetId = pMap.get(selected.id) ?? null;
        } else if (e.key === "ArrowRight") {
          const children = cMap.get(selected.id) ?? [];
          targetId = children[0] ?? null;
        } else {
          // ArrowUp / ArrowDown
          const parentId = pMap.get(selected.id);
          if (!parentId) return; // root, skip
          const siblings = cMap.get(parentId) ?? [];
          const idx = siblings.indexOf(selected.id);
          if (e.key === "ArrowUp") {
            targetId = idx > 0 ? siblings[idx - 1] : null;
          } else {
            targetId = idx < siblings.length - 1 ? siblings[idx + 1] : null;
          }
        }

        if (!targetId) return;

        useMindMapStore.setState((state) => ({
          nodes: state.nodes.map((n) => ({
            ...n,
            selected: n.id === targetId,
          })),
        }));
        setFocusedImageNodeId(null);

        requestAnimationFrame(() => {
          fitView({ nodes: [{ id: targetId! }], duration: 300, maxZoom: zoom });
        });
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    searchOpen,
    addChild,
    addSibling,
    deleteSelected,
    focusedImageNodeId,
    handleRemoveImage,
    cleanupImagesForNodes,
    copyNode,
    pasteNode,
    selectAll,
    canEdit,
  ]);

  return (
    <div className="w-screen h-screen flex flex-col">
      <EditorToolbar
        title={mindMap.title}
        saveStatus={saveStatus}
        onStyleClick={() => setStylePanelOpen((v) => !v)}
        styleOpen={stylePanelOpen}
        onBack={() => router.push("/dashboard")}
        onSearchClick={() => setSearchOpen(true)}
        canvasTheme={canvasTheme}
        onThemeChange={handleThemeChange}
        onManageAccessClick={() => {
          setManageAccessOpen((v) => !v);
        }}
        canEdit={canEdit}
      />

      {searchOpen && (
        <SearchOverlay
          value={searchQuery}
          onChange={setSearchQuery}
          matches={matches}
          currentIndex={currentMatchIndex}
          onNext={goToNextMatch}
          onPrev={goToPrevMatch}
          onSelect={selectMatch}
          onClose={closeSearch}
        />
      )}

      {/* Hidden file input untuk insert image dari context menu */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onInsertImage={handleInsertImageClick}
          onCopy={handleCopyFromContextMenu}
          onPaste={handlePasteFromContextMenu}
          pasteDisabled={clipboard === null}
          canEdit={canEdit}
        />
      )}
      <div
        className="flex-1 relative"
        onPointerMove={onCursorPointerMove}
        onPointerLeave={onCursorPointerLeave}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "custom" }}
          onNodesChange={handleNodesChange}
          onEdgesChange={applyEdgeChanges}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={onNodeContextMenu}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={null}
          panOnDrag={true}
          panOnScroll={true}
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll={false}
          zoomOnPinch={true}
          selectionOnDrag={false}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          translateExtent={dynamicTranslateExtent}
          minZoom={0.25}
          style={{ background: theme.canvasBg }}
        >
          {/* ghost node */}
          {ghostNode &&
            dragDecision &&
            dragDecision.type !== "BLOCK" &&
            (() => {
              const GHOST_W = 60;
              const GHOST_H = 20;
              const GHOST_GAP = 9 * zoom;

              const targetNode = nodes.find(
                (n) => n.id === dragDecision.targetId,
              );
              const targetPos = flowToScreenPosition(
                targetNode?.position ?? { x: 0, y: 0 },
              );
              const targetHeight = (targetNode?.measured?.height ?? 40) * zoom;

              let top: number;
              let left: number = targetPos.x;

              if (dragDecision.type === "REPARENT") {
                const pos = flowToScreenPosition(ghostNode.position);
                top = pos.y - 44;
                left = pos.x;
              } else if (dragDecision.type === "REORDER_BEFORE") {
                top = targetPos.y - GHOST_GAP - GHOST_H - 44;
              } else {
                top = targetPos.y + targetHeight + GHOST_GAP - 44;
              }

              return (
                <div
                  className="absolute pointer-events-none z-50 rounded-md bg-blue-500 opacity-60"
                  style={{ left, top, width: GHOST_W, height: GHOST_H }}
                />
              );
            })()}
          {/* drag shadow */}
          {draggingNodeId && mouseScreenPos && draggingNodeData && (
            <div
              className="absolute pointer-events-none z-50 overflow-hidden rounded-md border-2 shadow-sm"
              style={{
                left: mouseScreenPos.x,
                top: mouseScreenPos.y - 44,
                width: draggingNodeData.measuredWidth * zoom,
                height: draggingNodeData.measuredHeight * zoom,
                transform: `translate(-50%, -50%)`,
                backgroundColor: draggingNodeData.bgColor,
                borderColor: draggingNodeData.borderColor,
                opacity: 0.8,
              }}
            >
              <div
                style={{
                  width: draggingNodeData.measuredWidth,
                  height: draggingNodeData.measuredHeight,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                }}
                className="flex items-center justify-center text-center px-4 py-2"
              >
                <span
                  className="text-gray-800 font-medium text-sm"
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxWidth: draggingNodeData.measuredWidth - 32,
                  }}
                >
                  {draggingNodeData.label}
                </span>
              </div>
            </div>
          )}
          <Background color={theme.patternColor} />{" "}
          <div className="absolute bottom-4 left-4 z-50">
            {!controlsOpen ? (
              /* =========================
       CONTROLS CLOSED
       ========================= */
              <button
                onClick={() => setControlsOpen(true)}
                title="Show controls"
                className="
        flex h-7 w-7
        items-center justify-center
        rounded-full
        border border-slate-600
        bg-slate-900
        text-slate-200
        shadow-xl
        transition-all
        duration-200
        hover:bg-slate-800
        hover:text-white
        active:scale-95
      "
              >
                <ChevronUp size={19} strokeWidth={2.5} />
              </button>
            ) : (
              /* =========================
       CONTROLS OPEN
       ========================= */
              <Controls
                className="
        controls-custom
        !static
        !m-0
        !overflow-hidden
        !rounded-full
        !border
        !border-slate-600
        !bg-slate-900
        !shadow-xl
      "
              >
                {/* =========================
          MINIMAP
          ========================= */}
                <ControlButton
                  onClick={() => setMiniMapOpen((v) => !v)}
                  title="Toggle MiniMap"
                  className="
          !border-0
          !bg-slate-900
          !text-slate-300
          hover:!bg-slate-800
          hover:!text-white
          transition-colors
        "
                >
                  <MapIcon size={15} strokeWidth={2} />
                </ControlButton>

                {/* =========================
          CLOSE CONTROLS
          ========================= */}
                <ControlButton
                  onClick={() => setControlsOpen(false)}
                  title="Hide controls"
                  className="
          !border-0
          !bg-slate-900
          !text-slate-300
          hover:!bg-slate-800
          hover:!text-white
          transition-colors
        "
                >
                  <ChevronDown size={17} strokeWidth={2.5} />
                </ControlButton>
              </Controls>
            )}
          </div>
          {miniMapOpen && (
            <MiniMap
              zoomable
              pannable
              nodeStrokeWidth={3}
              style={{
                width: 180,
                height: 120,
                backgroundColor: theme.miniMapBg,
                border: `1px solid ${theme.miniMapBorder}`,
                borderRadius: "8px",
              }}
              nodeColor={(n) => {
                if (n.data?.isRoot) return "#f59e0b";
                if (n.data?.bgColor) return n.data.bgColor as string;
                return theme.miniMapNodeDefault;
              }}
              maskColor={theme.miniMapMask}
            />
          )}{" "}
        </ReactFlow>
        {ghostEdgePath && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-40"
            style={{ overflow: "visible" }}
          >
            <path
              d={ghostEdgePath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1.5}
              opacity={0.6}
            />
          </svg>
        )}

        <LiveCursors />

        {stylePanelOpen && (
          <StyleSidebar
            selectedNode={selectedNode}
            onClose={() => setStylePanelOpen(false)}
            canEdit={canEdit}
          />
        )}
      </div>

      {manageAccessOpen && (
        <ManageAccessModal
          mindMapId={mindMap.id}
          role={role}
          onClose={() => setManageAccessOpen(false)}
        />
      )}
    </div>
  );
}
