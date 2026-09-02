"use client";

import { ReactNode } from "react";
import { LiveMap, LiveObject } from "@liveblocks/client";
import type { Node, Edge } from "@xyflow/react";
import {
  RoomProvider,
  toStorageNode,
  toStorageEdge,
} from "@/liveblocks.config";
import type { CanvasTheme } from "@/app/editor/[id]/lib/themes";

export default function CollabRoomProvider({
  mindMapId,
  initialNodes,
  initialEdges,
  initialTheme,
  children,
}: {
  mindMapId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  initialTheme: CanvasTheme;
  children: ReactNode;
}) {
  return (
    <RoomProvider
      id={mindMapId}
      initialPresence={{ cursor: null }}
      initialStorage={{
        nodes: new LiveMap(
          initialNodes.map((n) => [n.id, new LiveObject(toStorageNode(n))]),
        ),
        edges: new LiveMap(
          initialEdges.map((e, i) => [
            e.id,
            new LiveObject(toStorageEdge(e, i)),
          ]),
        ),
        theme: initialTheme,
      }}
    >
      {children}
    </RoomProvider>
  );
}
