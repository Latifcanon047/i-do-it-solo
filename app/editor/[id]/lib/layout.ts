import type { Node, Edge } from "@xyflow/react";

// ===== CONSTANTS =====
export const LEVEL_SPACING = 220;
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

  const roots = nodes.filter(
    (n) => !parentTargets.has(n.id) && !hiddenNodeIds.has(n.id),
  );
  roots.sort((a, b) => (b.data?.isRoot ? 1 : 0) - (a.data?.isRoot ? 1 : 0));

  let cursorY = 0;

  function layoutNode(nodeId: string, depth: number, anchorX: number): number {
    const children = (childrenMap.get(nodeId) || []).filter(
      (cid) => !hiddenNodeIds.has(cid),
    );

    if (children.length === 0) {
      const y = cursorY;
      positions.set(nodeId, { x: anchorX + depth * LEVEL_SPACING, y });
      cursorY += SIBLING_SPACING;
      return y;
    }

    const childYs = children.map((cid) => layoutNode(cid, depth + 1, anchorX));
    const y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    positions.set(nodeId, { x: anchorX + depth * LEVEL_SPACING, y });
    return y;
  }

  for (const root of roots) {
    layoutNode(root.id, 0, root.position.x);
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
