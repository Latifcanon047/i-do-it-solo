import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getMindMapRole, canManage } from "@/lib/permissions";

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; pendingInviteId: string }> },
) {
  const { id, pendingInviteId } = await params;
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getMindMapRole(id, session.user.id);
  if (!canManage(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await prisma.pendingInvite.deleteMany({
    where: { id: pendingInviteId, mindMapId: id },
  });

  if (count === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ message: "Deleted" });
}
