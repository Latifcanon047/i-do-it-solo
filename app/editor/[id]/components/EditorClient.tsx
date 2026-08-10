"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  PanOnScrollMode,
  useViewport,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import MindMapNode from "./MindMapNode";
import EditorToolbar from "./EditorToolbar";
import SearchOverlay from "./SearchOverlay";
import StyleSidebar from "./StyleSidebar";
import CustomEdge from "./CustomEdge";
import { useMindMapStore, type DropZone } from "@/store/mindMapStore";
import {
  layoutForest,
  buildChildrenMap,
  buildParentMap,
  getDescendants,
  getAncestors,
  getHiddenNodeIds,
} from "@/app/editor/[id]/lib/layout";
import {
  hitTestDrag,
  decideDragAction,
  type DragDecision,
} from "@/app/editor/[id]/lib/dragEngine";

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { custom: CustomEdge };

interface Props {
  mindMap: {
    id: string;
    title: string;
    content: unknown;
  };
}

export default function EditorClient({ mindMap }: Props) {
  return (
    <ReactFlowProvider>
      <EditorCanvas mindMap={mindMap} />
    </ReactFlowProvider>
  );
}

function EditorCanvas({ mindMap }: Props) {
  const router = useRouter();

  const init = useMindMapStore((s) => s.init);
  const nodes = useMindMapStore((s) => s.nodes);
  const edges = useMindMapStore((s) => s.edges);
  const applyNodeChanges = useMindMapStore((s) => s.applyNodeChanges);
  const applyEdgeChanges = useMindMapStore((s) => s.applyEdgeChanges);
  const addChild = useMindMapStore((s) => s.addChild);
  const addSibling = useMindMapStore((s) => s.addSibling);
  const deleteSelected = useMindMapStore((s) => s.deleteSelected);
  const saveStatus = useMindMapStore((s) => s.saveStatus);
  const setSaveStatus = useMindMapStore((s) => s.setSaveStatus);

  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const { fitView, setNodes, flowToScreenPosition } = useReactFlow();
  const [dragDecision, setDragDecision] = useState<DragDecision | null>(null);
  const dragOriginRef = useRef<{
    id: string;
    position: { x: number; y: number };
  } | null>(null);
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
  } | null>(null);
  // Fase 2 — Hysteresis: simpan target aktif dari frame sebelumnya
  const previousTargetRef = useRef<string | null>(null);
  const commitDragDecision = useMindMapStore((s) => s.commitDragDecision);
  const orphanNode = useMindMapStore((s) => s.orphanNode);
  const { zoom } = useViewport();
  console.log("render zoom:", zoom);

  // save

  // Tambah helper ini
  function runLayout() {
    const { nodes: latestNodes, edges: latestEdges } =
      useMindMapStore.getState();
    const cMap = buildChildrenMap(latestEdges);
    const hidden = getHiddenNodeIds(latestNodes, cMap);
    const positions = layoutForest(latestNodes, latestEdges, cMap, hidden);
    setNodes((nds) =>
      nds.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    );
  }

  useEffect(() => {
    const content = mindMap.content as { nodes: Node[]; edges: Edge[] };
    init(mindMap.id, mindMap.title, content.nodes ?? [], content.edges ?? []);
  }, [mindMap.id]);

  // Autosave
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
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
  }, [nodes, edges, mindMap.id]);

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

    setNodes((nds) =>
      nds.map((n) => {
        if (n.data?.isOrphan) return n;
        return positions.has(n.id)
          ? { ...n, position: positions.get(n.id)! }
          : n;
      }),
    );
  }, [structureSignature]);

  function onNodeDragStart(_: MouseEvent | TouchEvent, node: Node) {
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
    });
  }

  function onNodeDrag(e: MouseEvent | TouchEvent, node: Node) {
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

    // ... sisa kode onNodeDrag yang sudah ada ...
    const candidates = nodes.filter(
      (n) => n.id !== node.id && !hiddenNodeIds.has(n.id),
    );
    const hit = hitTestDrag(node, candidates, previousTargetRef.current);
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
      // Hapus isOrphan flag sebelum commit
      setNodes((nds) =>
        nds.map((n) =>
          n.id === decision.dragId
            ? { ...n, data: { ...n.data, isOrphan: false } }
            : n,
        ),
      );
      commitDragDecision(decision);
    } else {
      orphanNode(node.id);
      return;
    }

    const { nodes: latestNodes, edges: latestEdges } =
      useMindMapStore.getState();
    const cMap = buildChildrenMap(latestEdges);
    const hidden = getHiddenNodeIds(latestNodes, cMap);
    const positions = layoutForest(latestNodes, latestEdges, cMap, hidden);
    setNodes((nds) =>
      nds.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    );
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

  useEffect(() => {
    setCurrentMatchIndex(-1);
  }, [searchQuery]);

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
    const GHOST_SCALE = 0.5;
    const dragNode = nodes.find((n) => n.id === dragDecision.dragId);
    const GHOST_HEIGHT =
      (dragNode?.measured?.height ?? 32) * zoom * GHOST_SCALE;
    const GHOST_GAP = 6 * zoom;

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
      ghostTop = targetPos.y - GHOST_GAP - GHOST_HEIGHT - TOOLBAR_OFFSET;
      ghostLeft = targetPos.x;
    } else {
      ghostTop = targetPos.y + targetHeight + GHOST_GAP - TOOLBAR_OFFSET;
      ghostLeft = targetPos.x;
    }

    const x2 = ghostLeft;
    const y2 = ghostTop + GHOST_HEIGHT / 2;

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
        draggable: !n.data?.isRoot,
        style: draggingNodeId === n.id ? { opacity: 0.3 } : undefined,
        data: {
          ...n.data,
          childCount: getDescendants(n.id, childrenMap).length,
          searchMatch: matchIds.includes(n.id),
          searchActive: n.id === activeMatchId,
          dropZone: previewZone,
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
  ]);

  const displayEdges = useMemo(() => {
    return edges.map((e) => ({
      ...e,
      hidden: hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target),
    }));
  }, [edges, hiddenNodeIds]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const selected = nodes.find((n) => n.selected);

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selected) return;
        e.preventDefault();
        if (selected.data?.isRoot) return;
        deleteSelected();
        return;
      }

      if (e.key === "Tab") {
        if (!selected) return;
        e.preventDefault();
        addChild(selected.id);
        requestAnimationFrame(runLayout);
        return;
      }

      if (e.key === "Enter") {
        if (!selected) return;
        e.preventDefault();
        addSibling(selected.id);
        requestAnimationFrame(runLayout);
        return;
      }

      if (e.key === " ") {
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
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, edges, searchOpen, addChild, addSibling, deleteSelected]);

  return (
    <div className="w-screen h-screen flex flex-col">
      <EditorToolbar
        title={mindMap.title}
        saveStatus={saveStatus}
        onStyleClick={() => setStylePanelOpen((v) => !v)}
        styleOpen={stylePanelOpen}
        onBack={() => router.push("/dashboard")}
        onSearchClick={() => setSearchOpen(true)}
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

      <div className="flex-1 relative">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "custom" }}
          onNodesChange={applyNodeChanges}
          onEdgesChange={applyEdgeChanges}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={null}
          panOnScroll={true}
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll={false}
          zoomOnPinch={true}
          selectionOnDrag={false}
          panOnDrag={true}
        >
          {ghostNode &&
            dragDecision &&
            dragDecision.type !== "BLOCK" &&
            (() => {
              const targetNode = nodes.find(
                (n) => n.id === dragDecision.targetId,
              );
              const dragNode = nodes.find((n) => n.id === dragDecision.dragId);
              const targetPos = flowToScreenPosition(
                targetNode?.position ?? { x: 0, y: 0 },
              );
              const GHOST_SCALE = 0.7;
              const ghostHeight =
                (dragNode?.measured?.height ?? 32) * zoom * GHOST_SCALE;
              const ghostWidth =
                (dragNode?.measured?.width ?? 80) * zoom * GHOST_SCALE;
              const targetHeight = (targetNode?.measured?.height ?? 40) * zoom;
              const GHOST_GAP = 9 * zoom;

              let top: number;
              let left: number = targetPos.x;

              if (dragDecision.type === "REPARENT") {
                const pos = flowToScreenPosition(ghostNode.position);
                top = pos.y - 44;
                left = pos.x;
              } else if (dragDecision.type === "REORDER_BEFORE") {
                top = targetPos.y - GHOST_GAP - ghostHeight - 44;
              } else {
                top = targetPos.y + targetHeight + GHOST_GAP - 44;
              }

              return (
                <div
                  className="absolute pointer-events-none z-50 rounded-md bg-blue-500 opacity-60"
                  style={{
                    left,
                    top,
                    width: ghostWidth,
                    height: ghostHeight,
                  }}
                />
              );
            })()}{" "}
          {draggingNodeId && mouseScreenPos && draggingNodeData && (
            <div
              className="absolute pointer-events-none z-50 rounded-xl border-2 shadow-sm text-center px-4 py-2 min-w-30"
              style={{
                left: mouseScreenPos.x,
                top: mouseScreenPos.y - 44,
                transform: `translate(-50%, -50%) scale(${zoom})`,
                transformOrigin: "center center",
                backgroundColor: draggingNodeData.bgColor,
                borderColor: draggingNodeData.borderColor,
                opacity: 0.8,
              }}
            >
              <span className="text-gray-800 font-medium text-sm">
                {draggingNodeData.label}
              </span>
            </div>
          )}
          <Background />
          <Controls />
          <MiniMap />
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
        {stylePanelOpen && (
          <StyleSidebar
            selectedNode={selectedNode}
            onClose={() => setStylePanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
