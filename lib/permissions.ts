import prisma from "@/lib/prisma";

export type MindMapRole = "OWNER" | "EDITOR" | "VIEWER" | null;

/**
 * Cek role user terhadap sebuah mindmap.
 * Return null kalau user gak punya akses sama sekali.
 */
export async function getMindMapRole(
  mindMapId: string,
  userId: string,
): Promise<MindMapRole> {
  const mindMap = await prisma.mindMap.findUnique({
    where: { id: mindMapId },
    select: { userId: true },
  });

  if (!mindMap) return null;

  if (mindMap.userId === userId) return "OWNER";

  const collaborator = await prisma.mindMapCollaborator.findUnique({
    where: {
      mindMapId_userId: {
        mindMapId,
        userId,
      },
    },
    select: { role: true },
  });

  if (!collaborator) return null;

  return collaborator.role; // "EDITOR" | "VIEWER"
}

/** Owner & Editor boleh ubah konten mindmap (node, edge, title, theme) */
export function canEdit(role: MindMapRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/** Cuma Owner yang boleh delete mindmap / kelola akses (invite, manage access) */
export function canManage(role: MindMapRole): boolean {
  return role === "OWNER";
}

/** Owner, Editor, Viewer semua boleh liat/buka mindmap */
export function canView(role: MindMapRole): boolean {
  return role !== null;
}
