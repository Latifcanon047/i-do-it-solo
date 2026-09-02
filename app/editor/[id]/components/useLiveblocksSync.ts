"use client";

import { useEffect, useRef } from "react";
import { LiveObject } from "@liveblocks/client";
import type { Node, Edge } from "@xyflow/react";
import {
  useRoom,
  useStorage,
  toStorageNode,
  toStorageEdge,
  fromStorageNode,
  fromStorageEdge,
  type StorageNode,
  type StorageEdge,
} from "@/liveblocks.config";
import { useMindMapStore } from "@/store/mindMapStore";

const SYNC_THROTTLE_MS = 300;

// Shallow compare cukup di sini karena tiap mutasi Zustand (store) selalu
// bikin object node/edge baru (immutable update pattern) — kalau referensi
// data/position beda, berarti emang berubah.
function nodeChanged(a: Node, b: LiveObject<StorageNode>) {
  const position = b.get("position");
  return (
    a.position.x !== position.x ||
    a.position.y !== position.y ||
    a.data !== b.get("data") ||
    a.type !== b.get("type")
  );
}

function edgeChanged(a: Edge, order: number, b: LiveObject<StorageEdge>) {
  return (
    a.source !== b.get("source") ||
    a.target !== b.get("target") ||
    a.type !== b.get("type") ||
    order !== b.get("order")
  );
}

export function useLiveblocksSync(
  nodes: Node[],
  edges: Edge[],
  applyRemoteUpdate: (nodes: Node[], edges: Edge[]) => void,
  role: "OWNER" | "EDITOR" | "VIEWER",
) {
  const room = useRoom();
  const storageResult = useStorage((root) => root);

  // Guard: true selama lagi apply perubahan dari remote → Zustand, biar efek
  // outbound (di bawah) gak nganggep itu perubahan lokal terus broadcast balik
  // (infinite loop lokal <-> remote).
  const isApplyingRemoteRef = useRef(false);
  const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ===== OUTBOUND: Zustand (nodes/edges) -> Liveblocks Storage =====
  useEffect(() => {
    // VIEWER gak boleh nulis ke Storage (room-nya read-only di level
    // Liveblocks) — kalau dipaksa nulis, Liveblocks throw Uncaught Error.
    if (role === "VIEWER") {
      return;
    }

    if (isApplyingRemoteRef.current) {
      return;
    }

    if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    pendingTimeoutRef.current = setTimeout(() => {
      if (isApplyingRemoteRef.current) {
        return;
      }

      const snapshot = room.getStorageSnapshot();
      // getStorageSnapshot bisa {} kalau Storage belum ready — skip aja,
      // nanti effect ini jalan lagi begitu nodes/edges berubah lagi.
      if (!snapshot || !("get" in snapshot)) return;

      const liveNodes = snapshot.get("nodes");
      const liveEdges = snapshot.get("edges");

      // Push node yang baru/berubah
      for (const n of nodes) {
        const existing = liveNodes.get(n.id);
        const storageNode = toStorageNode(n);
        if (!existing || nodeChanged(n, existing)) {
          liveNodes.set(n.id, new LiveObject(storageNode));
        }
      }

      // Push edge yang baru/berubah (kirim index array sebagai `order`,
      // biar urutan sibling bisa direkonstruksi lagi di inbound — LiveMap
      // gak menjamin urutan iterasi sama kayak urutan insert asli)
      edges.forEach((e, i) => {
        const existing = liveEdges.get(e.id);
        const storageEdge = toStorageEdge(e, i);
        if (!existing || edgeChanged(e, i, existing)) {
          liveEdges.set(e.id, new LiveObject(storageEdge));
        }
      });

      // Hapus node/edge — BUKAN dari diff array vs Storage (gak reliable
      // multi-tab: bisa salah nganggep node baru punya tab lain yang belum
      // sempet ke-sync sebagai "harus dihapus"), tapi dari buffer eksplisit
      // yang cuma keisi kalau user BENERAN ngehapus lokal di tab ini
      // (deleteSelected / orphanNode / commitDragDecision / undo / redo).
      const { nodeIds: nodeIdsToDelete, edgeIds: edgeIdsToDelete } =
        useMindMapStore.getState().consumePendingRemovals();

      for (const id of nodeIdsToDelete) {
        liveNodes.delete(id);
      }

      for (const id of edgeIdsToDelete) {
        liveEdges.delete(id);
      }
    }, SYNC_THROTTLE_MS);

    return () => {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    };
  }, [nodes, edges, room, role]);

  // ===== INBOUND: Liveblocks Storage -> Zustand (applyRemoteUpdate) =====
  useEffect(() => {
    if (!storageResult) return; // Storage belum ready

    const remoteNodes = Object.values(storageResult.nodes).map((n) =>
      fromStorageNode(n as StorageNode),
    ) as Node[];
    const remoteEdges = Object.values(storageResult.edges)
      .map((e) => e as StorageEdge)
      .sort((a, b) => a.order - b.order)
      .map((e) => fromStorageEdge(e)) as Edge[];

    isApplyingRemoteRef.current = true;
    applyRemoteUpdate(remoteNodes, remoteEdges);
    // Lepas guard di tick berikutnya — biar outbound effect yang ke-trigger
    // oleh applyRemoteUpdate ini sempat liat guard masih nyala & skip.
    setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageResult]);
}
