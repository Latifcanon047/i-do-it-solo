"use client";

import { useCallback, useRef } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useMyPresence, useOthers } from "@/liveblocks.config";

const THROTTLE_MS = 50;

// Hook publish — dipanggil di wrapper canvas (EditorClient), BUKAN di sini,
// karena butuh nempel ke elemen yang beneran nangkep pointer event.
export function usePublishCursor() {
  const { screenToFlowPosition } = useReactFlow();
  const [, updateMyPresence] = useMyPresence();
  const lastUpdateRef = useRef(0);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < THROTTLE_MS) return;
      lastUpdateRef.current = now;
      updateMyPresence({
        cursor: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      });
    },
    [screenToFlowPosition, updateMyPresence],
  );

  const onPointerLeave = useCallback(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  return { onPointerMove, onPointerLeave };
}

// Komponen render — nampilin cursor semua user lain di room.
export default function LiveCursors() {
  const { x: vx, y: vy, zoom } = useViewport();
  const others = useOthers();

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {others.map(({ connectionId, presence, info }) => {
        if (!presence.cursor || !info) return null;
        // Container-local transform — SAMA kayak yang dipake React Flow render node,
        // sengaja BUKAN flowToScreenPosition() karena itu page/viewport-relative,
        // bukan relatif ke container div overlay ini.
        const pos = {
          x: presence.cursor.x * zoom + vx,
          y: presence.cursor.y * zoom + vy,
        };

        return (
          <div
            key={connectionId}
            className="absolute flex items-center gap-1.5"
            style={{
              left: pos.x,
              top: pos.y,
              transform: "translate(-2px, -2px)",
              transition: "left 60ms linear, top 60ms linear",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill={info.color}>
              <path d="M1 1 L1 14 L4.5 11 L7 16 L9 15 L6.5 10 L12 10 Z" />
            </svg>
            <span
              className="px-1.5 py-0.5 rounded text-[11px] font-medium text-white whitespace-nowrap shadow-sm"
              style={{ backgroundColor: info.color }}
            >
              {info.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
