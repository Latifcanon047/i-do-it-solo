import type { Node, Edge } from "@xyflow/react";
import { buildParentMap, buildChildrenMap, getDescendants } from "./layout";

export type DropZone = "before" | "center" | "after";

export interface HitTestResult {
  targetId: string;
  zone: DropZone;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ACTIVATION_PADDING = 32;
const REPARENT_OVERLAP_THRESHOLD = 0.3;
const REORDER_ZONE_PERCENT = 0.25;
/**
 * Fase 2 — Hysteresis multiplier.
 * Target aktif saat ini dikasih bonus overlap sebesar faktor ini
 * supaya kandidat baru harus menang secara signifikan sebelum bisa menggantikan.
 * Naikkan untuk sticky lebih kuat, turunkan untuk lebih responsif.
 */
const HYSTERESIS_MULTIPLIER = 1.4;

function getVisualRect(n: Node): Rect {
  return {
    x: n.position.x,
    y: n.position.y,
    width: n.measured?.width ?? 150,
    height: n.measured?.height ?? 40,
  };
}

function getActivationRect(n: Node): Rect {
  const visual = getVisualRect(n);
  return {
    x: visual.x - ACTIVATION_PADDING,
    y: visual.y - ACTIVATION_PADDING,
    width: visual.width + ACTIVATION_PADDING * 2,
    height: visual.height + ACTIVATION_PADDING * 2,
  };
}

function getOverlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return xOverlap * yOverlap;
}

/**
 * HIT TESTER
 * Murni geometri. Gak tau apa-apa soal parent/child/tree.
 *
 * previousTargetId — target aktif dari frame sebelumnya (dari useRef di EditorCanvas).
 * Kalau ada, overlap-nya dikali HYSTERESIS_MULTIPLIER sebelum dibanding kandidat lain.
 * Kandidat baru harus menang dengan selisih signifikan supaya bisa replace.
 */
export function hitTestDrag(
  draggedNode: Node,
  candidateNodes: Node[],
  previousTargetId: string | null = null,
  dragRect?: { x: number; y: number; width: number; height: number },
): HitTestResult | null {
  if (candidateNodes.length === 0) return null;

  const draggedVisual = dragRect ?? getVisualRect(draggedNode);
  let best: Node | null = null;
  let bestArea = 0;

  for (const candidate of candidateNodes) {
    const activationRect = getActivationRect(candidate);
    const rawArea = getOverlapArea(draggedVisual, activationRect);

    // Bonus hysteresis untuk target aktif sebelumnya
    const effectiveArea =
      candidate.id === previousTargetId
        ? rawArea * HYSTERESIS_MULTIPLIER
        : rawArea;

    if (effectiveArea > bestArea) {
      bestArea = effectiveArea;
      best = candidate;
    }
  }

  if (!best || bestArea === 0) return null;

  const targetVisual = getVisualRect(best);
  const targetArea = targetVisual.width * targetVisual.height;

  const visualOverlapArea = getOverlapArea(draggedVisual, targetVisual);
  const overlapPercent = visualOverlapArea / targetArea;

  const draggedCenterX = draggedVisual.x + draggedVisual.width / 2;
  const targetCenterX = targetVisual.x + targetVisual.width / 2;
  const draggedCenterY = draggedVisual.y + draggedVisual.height / 2;
  const targetCenterY = targetVisual.y + targetVisual.height / 2;

  // Zona 25% atas dan bawah target → langsung REORDER
  const topZoneBottom =
    targetVisual.y + targetVisual.height * REORDER_ZONE_PERCENT;
  const bottomZoneTop =
    targetVisual.y + targetVisual.height * (1 - REORDER_ZONE_PERCENT);

  if (draggedCenterY <= topZoneBottom) {
    return { targetId: best.id, zone: "before" };
  }

  if (draggedCenterY >= bottomZoneTop) {
    return { targetId: best.id, zone: "after" };
  }

  // Center Y di tengah → cek REPARENT
  const isRightOfTarget = draggedCenterX > targetCenterX;
  if (isRightOfTarget && overlapPercent <= REPARENT_OVERLAP_THRESHOLD) {
    return { targetId: best.id, zone: "center" };
  }

  // Fallback → REORDER berdasarkan Y dominan
  const zone: DropZone = draggedCenterY <= targetCenterY ? "before" : "after";
  return { targetId: best.id, zone };
}

export type DragDecision =
  | { type: "REPARENT"; dragId: string; targetId: string }
  | {
      type: "REORDER_BEFORE";
      dragId: string;
      targetId: string;
      newParentId: string | null;
    }
  | {
      type: "REORDER_AFTER";
      dragId: string;
      targetId: string;
      newParentId: string | null;
    }
  | { type: "BLOCK"; dragId: string; targetId: string; reason: string };

/**
 * DECISION ENGINE
 * Murni logic tree. Gak nyentuh state, gak mutasi apapun.
 */
export function decideDragAction(
  dragId: string,
  targetId: string,
  zone: DropZone,
  nodes: Node[],
  edges: Edge[],
): DragDecision {
  if (dragId === targetId) {
    return { type: "BLOCK", dragId, targetId, reason: "self" };
  }

  const dragNode = nodes.find((n) => n.id === dragId);
  if (dragNode?.data?.isRoot) {
    return { type: "BLOCK", dragId, targetId, reason: "root-cannot-move" };
  }
  const targetNode = nodes.find((n) => n.id === targetId);
  if (targetNode?.data?.isRoot && zone !== "center") {
    return { type: "BLOCK", dragId, targetId, reason: "root-cannot-be-target" };
  }

  const childrenMap = buildChildrenMap(edges);
  const descendants = getDescendants(dragId, childrenMap);

  // Cycle bisa terjadi di REPARENT (target = descendant)
  // MAUPUN reorder (target ITU SENDIRI adalah descendant dragId)
  if (descendants.includes(targetId)) {
    return { type: "BLOCK", dragId, targetId, reason: "cycle-descendant" };
  }

  if (zone === "center") {
    return { type: "REPARENT", dragId, targetId };
  }

  const parentMap = buildParentMap(edges);
  const newParentId = parentMap.get(targetId) ?? null;

  // Target tanpa parent (orphan/root) gak bisa jadi target reorder sibling
  if (!newParentId) {
    return { type: "BLOCK", dragId, targetId, reason: "target-has-no-parent" };
  }

  if (zone === "before") {
    return { type: "REORDER_BEFORE", dragId, targetId, newParentId };
  }

  return { type: "REORDER_AFTER", dragId, targetId, newParentId };
}
