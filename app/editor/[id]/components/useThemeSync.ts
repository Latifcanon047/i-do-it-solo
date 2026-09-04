"use client";

import { useEffect } from "react";
import { useRoom, useStorage } from "@/liveblocks.config";
import type { CanvasTheme } from "@/app/editor/[id]/lib/themes";

// Sync `canvasTheme` — jalur TERPISAH dari useLiveblocksSync (nodes/edges).
// Scalar tunggal, immediate (gak throttle). OUTBOUND dipanggil manual lewat
// `pushTheme` (event-driven dari handleThemeChange), BUKAN reactive effect
// yang watch `canvasTheme` — jadi gak butuh guard anti-loop kayak nodes/edges,
// karena gak ada jalur di sini yang bisa mancing dirinya sendiri.
export function useThemeSync(
  canvasTheme: CanvasTheme,
  setCanvasTheme: (theme: CanvasTheme) => void,
  role: "OWNER" | "EDITOR" | "VIEWER",
) {
  const room = useRoom();
  const remoteTheme = useStorage((root) => root.theme);

  // INBOUND: Liveblocks Storage -> Zustand
  useEffect(() => {
    if (!remoteTheme) return; // room lama, dibuat sebelum fitur ini ada
    if (remoteTheme === canvasTheme) return;
    setCanvasTheme(remoteTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteTheme]);

  // OUTBOUND: Zustand -> Liveblocks Storage (dipanggil manual dari handleThemeChange)
  function pushTheme(theme: CanvasTheme) {
    if (role === "VIEWER") return; // VIEWER read-only — room permission gak izinin write
    const snapshot = room.getStorageSnapshot();
    if (!snapshot || !("set" in snapshot)) return;
    snapshot.set("theme", theme);
  }

  return { pushTheme };
}
