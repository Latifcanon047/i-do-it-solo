import type { Node, Edge } from "@xyflow/react";

// ===== CONSTANTS =====
const LEVEL_SPACING = 220;
const MIN_GAP = 80; // jarak minimum tepi kanan parent ke tepi kiri child
export const SIBLING_SPACING = 90;
export const TREE_GAP = 150;

// ===== TREE TRAVERSAL =====
export function buildChildrenMap(edges: Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!map.has(e.source)) map.set(e.source, []);
    map.get(e.source)!.push(e.target);
  });
  return map;
}

export function buildParentMap(edges: Edge[]): Map<string, string> {
  const map = new Map<string, string>();
  edges.forEach((e) => map.set(e.target, e.source));
  return map;
}

export function getDescendants(
  nodeId: string,
  childrenMap: Map<string, string[]>,
  visited: Set<string> = new Set(),
): string[] {
  const children = childrenMap.get(nodeId) || [];
  const result: string[] = [];
  for (const childId of children) {
    if (visited.has(childId)) continue;
    visited.add(childId);
    result.push(childId);
    result.push(...getDescendants(childId, childrenMap, visited));
  }
  return result;
}

export function getAncestors(
  nodeId: string,
  parentMap: Map<string, string>,
): string[] {
  const result: string[] = [];
  let current = parentMap.get(nodeId);
  while (current) {
    result.push(current);
    current = parentMap.get(current);
  }
  return result;
}

export function getHiddenNodeIds(
  nodes: Node[],
  childrenMap: Map<string, string[]>,
): Set<string> {
  const hidden = new Set<string>();
  nodes.forEach((n) => {
    if (n.data?.collapsed) {
      getDescendants(n.id, childrenMap).forEach((id) => hidden.add(id));
    }
  });
  return hidden;
}

// ===== LAYOUT =====
export function layoutForest(
  nodes: Node[],
  edges: Edge[],
  childrenMap: Map<string, string[]>,
  hiddenNodeIds: Set<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const parentTargets = new Set(edges.map((e) => e.target));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const roots = nodes.filter(
    (n) => !parentTargets.has(n.id) && !hiddenNodeIds.has(n.id),
  );
  roots.sort((a, b) => (b.data?.isRoot ? 1 : 0) - (a.data?.isRoot ? 1 : 0));

  let cursorY = 0;

  function layoutNode(nodeId: string, parentId: string | null): number {
    const node = nodeMap.get(nodeId);

    const children = (childrenMap.get(nodeId) || []).filter(
      (cid) => !hiddenNodeIds.has(cid),
    );

    // Hitung X dulu sebelum rekursi
    let x: number;
    if (parentId === null) {
      x = node?.position.x ?? 0;
    } else {
      const parentPos = positions.get(parentId)!;
      const parentNode = nodeMap.get(parentId);
      const parentWidth = parentNode?.measured?.width ?? 150;
      x = parentPos.x + parentWidth + MIN_GAP;
    }

    if (children.length === 0) {
      positions.set(nodeId, { x, y: cursorY });
      cursorY += SIBLING_SPACING;
      return cursorY - SIBLING_SPACING;
    }

    // Set posisi sementara dulu dengan x yang sudah dihitung
    // supaya child bisa baca parentPos waktu rekursi
    positions.set(nodeId, { x, y: 0 });

    const childYs = children.map((cid) => layoutNode(cid, nodeId));
    const y = (childYs[0] + childYs[childYs.length - 1]) / 2;

    // Update y setelah semua child selesai
    positions.set(nodeId, { x, y });
    return y;
  }

  for (const root of roots) {
    layoutNode(root.id, null);
    cursorY += TREE_GAP;
  }

  return positions;
}

// ===== POSITION PRE-CALCULATION =====
export function calcChildPosition(
  parent: Node,
  siblings: string[], // existing children ids of parent
  nodes: Node[],
): { x: number; y: number } {
  const x = parent.position.x + LEVEL_SPACING;

  if (siblings.length === 0) {
    return { x, y: parent.position.y };
  }

  // Taruh di bawah sibling terakhir
  const lastSiblingId = siblings[siblings.length - 1];
  const lastSibling = nodes.find((n) => n.id === lastSiblingId);
  const y = lastSibling
    ? lastSibling.position.y + SIBLING_SPACING
    : parent.position.y;

  return { x, y };
}

export function calcSiblingPosition(
  node: Node,
  coSiblings: string[], // semua sibling ids (tidak termasuk node itu sendiri)
  nodes: Node[],
): { x: number; y: number } {
  const x = node.position.x;

  if (coSiblings.length === 0) {
    return { x, y: node.position.y + SIBLING_SPACING };
  }

  // Taruh di bawah sibling terakhir
  const lastSiblingId = coSiblings[coSiblings.length - 1];
  const lastSibling = nodes.find((n) => n.id === lastSiblingId);
  const y = lastSibling
    ? lastSibling.position.y + SIBLING_SPACING
    : node.position.y + SIBLING_SPACING;

  return { x, y };
}

//ini boleh di harus belum kepake. tapi di pertahanin juga gak apa apa dulu
export function rerootEdges(
  nodeId: string,
  targetId: string,
  edges: Edge[],
  parentMap: Map<string, string>,
): Edge[] {
  // Susun jalur dari D naik ke atas sampai ketemu T (inclusive)
  const path: string[] = [nodeId];
  let current = parentMap.get(nodeId);
  while (current) {
    path.push(current);
    if (current === targetId) break;
    current = parentMap.get(current);
  }

  const grandParent = parentMap.get(targetId); // parent-nya T (kalau ada)

  // Edge lama di sepanjang chain yang mau dibalik
  const chainPairs = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    chainPairs.add(`${path[i + 1]}>${path[i]}`); // parent->child asli
  }

  const filtered = edges.filter((e) => {
    if (chainPairs.has(`${e.source}>${e.target}`)) return false;
    if (grandParent && e.source === grandParent && e.target === targetId)
      return false;
    return true;
  });

  const newEdges = [...filtered];

  // Balik arah chain: D->p1->p2->...->T
  for (let i = 0; i < path.length - 1; i++) {
    newEdges.push({
      id: `e-${path[i]}-${path[i + 1]}`,
      source: path[i],
      target: path[i + 1],
    });
  }

  // Grandparent sekarang connect ke D, gantiin posisi T
  if (grandParent) {
    newEdges.push({
      id: `e-${grandParent}-${nodeId}`,
      source: grandParent,
      target: nodeId,
    });
  }

  return newEdges;
}
