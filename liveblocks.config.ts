import { createClient, LiveMap, LiveObject } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import type { Json } from "@liveblocks/client";
import type { CanvasTheme } from "@/app/editor/[id]/lib/themes"; //

const client = createClient({
  authEndpoint: "/api/liveblocks-auth",
});

// Presence type — data live tiap user di room (cursor, dll). Diisi detailnya di Fase 3.
type Presence = {
  cursor: { x: number; y: number } | null;
  selectedNodeIds: string[];
  lock: { nodeId: string; mode: "edit" | "drag" } | null;
};

export type StorageNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, Json>;
};

export type StorageEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  order: number;
};

// LiveMap keyed by id (BUKAN LiveList) — supaya 2 user edit node BEDA
// secara bersamaan gak saling tabrak (key beda = independent write).
// CATATAN Bug #6: `theme` disimpan sebagai scalar langsung di root Storage
// (bukan LiveMap kayak nodes/edges) — ini properti ROOM, cuma satu nilai,
// gak butuh diffing per-id. Sync-nya lewat jalur terpisah dari
// useLiveblocksSync (yang didesain buat nodes/edges), lihat useThemeSync.
type Storage = {
  nodes: LiveMap<string, LiveObject<StorageNode>>;
  edges: LiveMap<string, LiveObject<StorageEdge>>;
  theme: CanvasTheme;
};

// BARU — Fase 3: UserMeta — data statis per user (diisi pas authorize di /api/liveblocks-auth)
type UserMeta = {
  id: string;
  info: {
    name: string;
    color: string;
  };
};

export const {
  RoomProvider,
  useOthers,
  useMyPresence,
  useUpdateMyPresence,
  useRoom,
  useStorage,
} = createRoomContext<Presence, Storage, UserMeta>(client);

// ===== Konversi Node/Edge (@xyflow/react) <-> StorageNode/StorageEdge =====
// Dipakai di CollabRoomProvider (initial seed) & useLiveblocksSync (Step 3/4).
// Storage cuma nyimpen field yang relevan disinkronkan — field lain (measured,
// dragging, style, dll) tetap dihitung lokal di tiap client.

export function toStorageNode(n: {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}): StorageNode {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as Record<string, Json>,
  };
}

export function toStorageEdge(
  e: {
    id: string;
    source: string;
    target: string;
    type?: string;
  },
  order: number,
): StorageEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type ?? "custom",
    order,
  };
}

export function fromStorageNode(n: StorageNode) {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as Record<string, unknown>,
  };
}

export function fromStorageEdge(e: StorageEdge) {
  return { id: e.id, source: e.source, target: e.target, type: e.type };
}
