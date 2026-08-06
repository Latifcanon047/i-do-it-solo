"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  PanOnScrollMode,
  type OnConnect,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import MindMapNode from "./MindMapNode";
import EditorToolbar from "./EditorToolbar";
import SearchOverlay from "./SearchOverlay";
import StyleSidebar from "./StyleSidebar";

const nodeTypes = { mindmap: MindMapNode };
interface MindMapData {
  nodes: Node[];
  edges: Edge[];
}

interface Props {
  mindMap: {
    id: string;
    title: string;
    content: unknown;
  };
}

type SaveStatus = "idle" | "saving" | "saved";

export default function EditorClient({ mindMap }: Props) {
  return (
    <ReactFlowProvider>
      <EditorCanvas mindMap={mindMap} />
    </ReactFlowProvider>
  );
}

function EditorCanvas({ mindMap }: Props) {
  const router = useRouter();
  const content = mindMap.content as MindMapData;
  const [nodes, setNodes, onNodesChange] = useNodesState(content.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(content.edges ?? []);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const { screenToFlowPosition, fitView } = useReactFlow();
  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

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

  // Peta relasi parent -> children & children -> parent, diturunin dari edges
  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    edges.forEach((e) => {
      if (!map.has(e.source)) map.set(e.source, []);
      map.get(e.source)!.push(e.target);
    });
    return map;
  }, [edges]);

  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    edges.forEach((e) => map.set(e.target, e.source));
    return map;
  }, [edges]);

  function getDescendants(
    nodeId: string,
    map: Map<string, string[]>,
    visited: Set<string> = new Set(),
  ): string[] {
    const children = map.get(nodeId) || [];
    const result: string[] = [];
    for (const childId of children) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      result.push(childId);
      result.push(...getDescendants(childId, map, visited));
    }
    return result;
  }

  function getAncestors(nodeId: string, map: Map<string, string>): string[] {
    const result: string[] = [];
    let current = map.get(nodeId);
    while (current) {
      result.push(current);
      current = map.get(current);
    }
    return result;
  }

  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    nodes.forEach((n) => {
      if (n.data?.collapsed) {
        getDescendants(n.id, childrenMap).forEach((id) => hidden.add(id));
      }
    });
    return hidden;
  }, [nodes, childrenMap]);

  // ===== SEARCH =====
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Sekarang: query kosong = tampilin semua node, query ada = filter yang cocok aja
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

  // Baru: klik langsung salah satu item di dropdown list
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

  function handleAddNode() {
    const id = crypto.randomUUID();

    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode: Node = {
      id,
      type: "mindmap",
      position: {
        x: center.x + (Math.random() * 60 - 30),
        y: center.y + (Math.random() * 60 - 30),
      },
      data: { label: "New Node" },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  function handleDeleteSelected() {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Kalau lagi ngetik di input/textarea, skip semua shortcut
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const selected = nodes.find((n) => n.selected);

      // Delete / Backspace — hapus selected
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selected) return;
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Tab — tambah CHILD node
      if (e.key === "Tab") {
        if (!selected) return;
        e.preventDefault();
        const id = crypto.randomUUID();
        const newNode: Node = {
          id,
          type: "mindmap",
          position: {
            x: selected.position.x + 200,
            y: selected.position.y,
          },
          data: { label: "New Node" },
        };
        const newEdge: Edge = {
          id: `e-${selected.id}-${id}`,
          source: selected.id,
          target: id,
        };
        setNodes((nds) => [...nds, newNode]);
        setEdges((eds) => [...eds, newEdge]);
        return;
      }

      // Enter — tambah SIBLING node (parent sama)
      if (e.key === "Enter") {
        if (!selected) return;
        e.preventDefault();
        const parentEdge = edges.find((ed) => ed.target === selected.id);
        const id = crypto.randomUUID();
        const newNode: Node = {
          id,
          type: "mindmap",
          position: {
            x: selected.position.x,
            y: selected.position.y + 80,
          },
          data: { label: "New Node" },
        };
        setNodes((nds) => [...nds, newNode]);
        if (parentEdge) {
          const newEdge: Edge = {
            id: `e-${parentEdge.source}-${id}`,
            source: parentEdge.source,
            target: id,
          };
          setEdges((eds) => [...eds, newEdge]);
        }
        return;
      }

      // Space — edit mode, block all
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
  }, [nodes, edges, searchOpen]);

  return (
    <div className="w-screen h-screen flex flex-col">
      <EditorToolbar
        title={mindMap.title}
        saveStatus={saveStatus}
        onAddNode={handleAddNode}
        onStyleClick={() => setStylePanelOpen((v) => !v)}
        styleOpen={stylePanelOpen}
        onDeleteSelected={handleDeleteSelected}
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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          panOnScroll={true} // scroll = geser layar (bukan zoom)
          panOnScrollMode={PanOnScrollMode.Free} // bebas arah (horizontal + vertikal)
          zoomOnScroll={false} // scroll gak zoom lagi
          zoomOnPinch={true} // pinch = zoom (touchpad/mobile)
          selectionOnDrag={false} // drag = pan, bukan select area
          panOnDrag={true} // drag canvas = pan
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
