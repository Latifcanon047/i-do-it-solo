import type { Node, Edge } from "@xyflow/react";

const MIN_GAP = 80;
const MIN_NODE_GAP = 20; //
export const SIBLING_SPACING = 90; // fallback kalau node height kecil
export const TREE_GAP = 150;

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
// layout.ts — ganti SELURUH fungsi layoutForest

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
    (n) =>
      !parentTargets.has(n.id) && !hiddenNodeIds.has(n.id) && !n.data?.isOrphan,
  );
  roots.sort((a, b) => (b.data?.isRoot ? 1 : 0) - (a.data?.isRoot ? 1 : 0));

  let cursorY = 0;

  // Geser posisi Y satu subtree (node + semua descendant) sejumlah delta.
  // Dipakai saat parent perlu digeser turun karena dia lebih tinggi
  // daripada span children-nya — supaya parent tetap center, bukan cuma "nunduk".
  function shiftSubtreeY(nodeId: string, delta: number) {
    const pos = positions.get(nodeId);
    if (pos) positions.set(nodeId, { x: pos.x, y: pos.y + delta });
    const kids = (childrenMap.get(nodeId) || []).filter(
      (cid) => !hiddenNodeIds.has(cid),
    );
    for (const kid of kids) {
      shiftSubtreeY(kid, delta);
    }
  }

  // Return: { centerY, subtreeBottom }
  // centerY   = posisi Y tengah node ini (untuk di-set ke positions)
  // subtreeBottom = batas bawah seluruh subtree node ini (cursorY setelah selesai)
  function layoutNode(
    nodeId: string,
    parentId: string | null,
  ): { centerY: number; subtreeBottom: number } {
    const startY = cursorY; // batas atas yang tersedia untuk node ini + subtree-nya
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

    // === LEAF NODE ===
    if (children.length === 0) {
      const centerY = cursorY + nodeHeight / 2;
      positions.set(nodeId, { x, y: centerY - nodeHeight / 2 });
      cursorY += nodeHeight + MIN_NODE_GAP;
      return { centerY, subtreeBottom: cursorY };
    }

    // === NODE DENGAN CHILDREN ===
    // Set posisi sementara supaya children bisa baca parentPos.x
    positions.set(nodeId, { x, y: 0 });

    // Layout semua children, kumpulkan centerY dan subtreeBottom masing-masing
    const childResults = children.map((cid) => layoutNode(cid, nodeId));

    // centerY parent = rata-rata center child pertama dan terakhir
    // centerY parent = rata-rata center child pertama dan terakhir
    let centerY =
      (childResults[0].centerY +
        childResults[childResults.length - 1].centerY) /
      2;

    // Kalau parent lebih tinggi dari span children-nya, dia bakal nembus
    // ke atas nabrak sibling sebelumnya. Geser SELURUH subtree children
    // turun sejumlah delta, supaya parent tetap center relatif ke children,
    // bukan cuma dipaksa turun sendirian.
    const minCenterY = startY + nodeHeight / 2;
    if (centerY < minCenterY) {
      const delta = minCenterY - centerY;
      centerY = minCenterY;
      for (const cid of children) {
        shiftSubtreeY(cid, delta);
      }
      cursorY += delta;
    }

    positions.set(nodeId, { x, y: centerY - nodeHeight / 2 });

    // subtreeBottom = max dari:
    // (a) subtreeBottom child terakhir (sudah di-advance cursorY oleh rekursi)
    // (b) bottom dari node parent itu sendiri (kalau parent lebih tinggi dari span children)
    const parentBottom = centerY + nodeHeight / 2 + MIN_NODE_GAP;
    const subtreeBottom = Math.max(cursorY, parentBottom);

    // Update cursorY ke subtreeBottom supaya sibling berikutnya mulai dari sini
    cursorY = subtreeBottom;

    return { centerY, subtreeBottom };
  }

  for (const root of roots) {
    layoutNode(root.id, null);
    cursorY += TREE_GAP;
  }

  // ===== ORPHAN CLUSTERS =====
  // Tiap orphan node punya cursorY lokal sendiri, independen dari main tree
  // DAN dari orphan lain. Anchor FIXED dari orphanAnchorY (bukan position.y live)
  // biar gak numpuk drift tiap kali di-relayout.
  const orphanNodes = nodes.filter(
    (n) => n.data?.isOrphan && !hiddenNodeIds.has(n.id),
  );

  for (const orphan of orphanNodes) {
    cursorY = (orphan.data?.orphanAnchorY as number) ?? orphan.position.y;
    layoutNode(orphan.id, null);
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
