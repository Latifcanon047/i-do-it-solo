import prisma from "@/lib/prisma";

/**
 * Dipanggil tepat setelah User baru resmi dibuat (baik lewat verify-email
 * manual maupun signIn callback Google). Cari semua PendingInvite yang
 * emailnya cocok, convert jadi MindMapCollaborator (kalau belum expired),
 * lalu hapus row PendingInvite-nya (expired atau berhasil dikonversi,
 * dua-duanya dihapus).
 */
export async function convertPendingInvites(userId: string, email: string) {
  const invites = await prisma.pendingInvite.findMany({
    where: { email },
  });

  for (const invite of invites) {
    if (invite.expiresAt >= new Date()) {
      await prisma.mindMapCollaborator.upsert({
        where: {
          mindMapId_userId: { mindMapId: invite.mindMapId, userId },
        },
        update: { role: invite.role },
        create: { mindMapId: invite.mindMapId, userId, role: invite.role },
      });
    }

    await prisma.pendingInvite.delete({ where: { id: invite.id } });
  }
}

export async function convertPendingInviteByToken(
  userId: string,
  userEmail: string,
  token: string,
) {
  const pendingInvite = await prisma.pendingInvite.findUnique({
    where: { token },
  });

  if (!pendingInvite) {
    return { status: "invalid" as const };
  }

  if (pendingInvite.expiresAt < new Date()) {
    await prisma.pendingInvite.delete({ where: { id: pendingInvite.id } });
    return { status: "expired" as const };
  }

  if (pendingInvite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return { status: "mismatch" as const };
  }

  await prisma.mindMapCollaborator.upsert({
    where: {
      mindMapId_userId: {
        mindMapId: pendingInvite.mindMapId,
        userId,
      },
    },
    update: { role: pendingInvite.role },
    create: {
      mindMapId: pendingInvite.mindMapId,
      userId,
      role: pendingInvite.role,
    },
  });

  await prisma.pendingInvite.delete({ where: { id: pendingInvite.id } });

  return { status: "success" as const, mindMapId: pendingInvite.mindMapId };
}
