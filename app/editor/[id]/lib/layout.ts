import type { Node, Edge } from "@xyflow/react";

// ===== CONSTANTS =====
const MIN_GAP = 80; // jarak minimum tepi kanan parent ke tepi kiri child
const MIN_NODE_GAP = 20; // jarak minimum antar tepi bawah node atas ke tepi atas node bawah
export const SIBLING_SPACING = 90; // fallback kalau node height kecil
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

  // Kembalikan centerY node ini
  // cursorY di-advance sesuai total tinggi subtree (termasuk node itu sendiri)
  function layoutNode(nodeId: string, parentId: string | null): number {
    const node = nodeMap.get(nodeId);
    const nodeHeight = node?.measured?.height ?? 40;

    const children = (childrenMap.get(nodeId) || []).filter(
      (cid) => !hiddenNodeIds.has(cid),
    );

    // Hitung X
    let x: number;
    if (parentId === null) {
      x = node?.position.x ?? 0;
    } else {
      const parentPos = positions.get(parentId)!;
      const parentNode = nodeMap.get(parentId);
      const parentWidth = parentNode?.measured?.width ?? 150;
      x = parentPos.x + parentWidth + MIN_GAP;
    }

    // Leaf node — advance cursorY sebesar tinggi node + gap
    if (children.length === 0) {
      const y = cursorY + nodeHeight / 2;
      positions.set(nodeId, { x, y });
      cursorY += nodeHeight + MIN_NODE_GAP;
      return y;
    }

    // Node dengan children:
    // 1. Catat posisi cursorY sebelum rekursi
    // 2. Layout semua children (cursorY akan di-advance oleh rekursi)
    // 3. Y parent = rata-rata center child pertama dan terakhir
    // 4. Pastikan cursorY melewati bottom parent

    const subtreeStart = cursorY; // posisi awal sebelum children di-layout

    // Set posisi sementara supaya children bisa baca parentPos
    positions.set(nodeId, { x, y: 0 });

    const childCenterYs = children.map((cid) => layoutNode(cid, nodeId));

    // Y parent = rata-rata center child pertama dan terakhir
    const y = (childCenterYs[0] + childCenterYs[childCenterYs.length - 1]) / 2;
    positions.set(nodeId, { x, y });

    // cursorY harus melewati:
    // (a) bottom dari node parent itu sendiri
    const parentBottom = y + nodeHeight / 2 + MIN_NODE_GAP;
    if (parentBottom > cursorY) {
      cursorY = parentBottom;
    }

    // (b) subtreeStart + tinggi parent (kalau parent lebih tinggi dari subtree children)
    const minCursorY = subtreeStart + nodeHeight + MIN_NODE_GAP;
    if (minCursorY > cursorY) {
      cursorY = minCursorY;
    }

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
  siblings: string[],
  nodes: Node[],
): { x: number; y: number } {
  const x = parent.position.x + 220;

  if (siblings.length === 0) {
    return { x, y: parent.position.y };
  }

  const lastSiblingId = siblings[siblings.length - 1];
  const lastSibling = nodes.find((n) => n.id === lastSiblingId);
  const lastHeight = lastSibling?.measured?.height ?? 40;
  const y = lastSibling
    ? lastSibling.position.y + lastHeight + MIN_NODE_GAP
    : parent.position.y;

  return { x, y };
}

export function calcSiblingPosition(
  node: Node,
  coSiblings: string[],
  nodes: Node[],
): { x: number; y: number } {
  const x = node.position.x;

  if (coSiblings.length === 0) {
    const nodeHeight = node.measured?.height ?? 40;
    return { x, y: node.position.y + nodeHeight + MIN_NODE_GAP };
  }

  const lastSiblingId = coSiblings[coSiblings.length - 1];
  const lastSibling = nodes.find((n) => n.id === lastSiblingId);
  const lastHeight = lastSibling?.measured?.height ?? 40;
  const y = lastSibling
    ? lastSibling.position.y + lastHeight + MIN_NODE_GAP
    : node.position.y + (node.measured?.height ?? 40) + MIN_NODE_GAP;

  return { x, y };
}

export function rerootEdges(
  nodeId: string,
  targetId: string,
  edges: Edge[],
  parentMap: Map<string, string>,
): Edge[] {
  const path: string[] = [nodeId];
  let current = parentMap.get(nodeId);
  while (current) {
    path.push(current);
    if (current === targetId) break;
    current = parentMap.get(current);
  }

  const grandParent = parentMap.get(targetId);

  const chainPairs = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    chainPairs.add(`${path[i + 1]}>${path[i]}`);
  }

  const filtered = edges.filter((e) => {
    if (chainPairs.has(`${e.source}>${e.target}`)) return false;
    if (grandParent && e.source === grandParent && e.target === targetId)
      return false;
    return true;
  });

  const newEdges = [...filtered];

  for (let i = 0; i < path.length - 1; i++) {
    newEdges.push({
      id: `e-${path[i]}-${path[i + 1]}`,
      source: path[i],
      target: path[i + 1],
    });
  }

  if (grandParent) {
    newEdges.push({
      id: `e-${grandParent}-${nodeId}`,
      source: grandParent,
      target: nodeId,
    });
  }

  return newEdges;
}
