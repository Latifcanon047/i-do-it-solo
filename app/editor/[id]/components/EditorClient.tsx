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
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import MindMapNode from "./MindMapNode";
import EditorToolbar from "./EditorToolbar";
import SearchOverlay from "./SearchOverlay";
import StyleSidebar from "./StyleSidebar";
import { useMindMapStore } from "@/store/mindMapStore";
import {
  layoutForest,
  buildChildrenMap,
  buildParentMap,
  getDescendants,
  getAncestors,
  getHiddenNodeIds,
} from "@/app/editor/[id]/lib/layout";

const nodeTypes = { mindmap: MindMapNode };

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
  const { fitView, setNodes } = useReactFlow();

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
    const edgeSig = edges
      .map((e) => `${e.source}>${e.target}`)
      .sort()
      .join(",");
    const collapsedSig = nodes
      .filter((n) => n.data?.collapsed)
      .map((n) => n.id)
      .sort()
      .join(",");
    return `${edgeSig}|${collapsedSig}`;
  }, [edges, nodes]);

  useEffect(() => {
    const positions = layoutForest(nodes, edges, childrenMap, hiddenNodeIds);
    setNodes((nds) =>
      nds.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureSignature]);

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

  const displayNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      hidden: hiddenNodeIds.has(n.id),
      data: {
        ...n.data,
        childCount: getDescendants(n.id, childrenMap).length,
        searchMatch: matchIds.includes(n.id),
        searchActive: n.id === activeMatchId,
      },
    }));
  }, [nodes, hiddenNodeIds, childrenMap, matchIds, activeMatchId]);

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
        return;
      }

      if (e.key === "Enter") {
        if (!selected) return;
        e.preventDefault();
        addSibling(selected.id);
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
          onNodesChange={applyNodeChanges}
          onEdgesChange={applyEdgeChanges}
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
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
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
