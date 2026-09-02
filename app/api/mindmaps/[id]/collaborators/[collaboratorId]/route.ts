import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getMindMapRole, canManage } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> },
) {
  const { id, collaboratorId } = await params;
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getMindMapRole(id, session.user.id);
  if (!canManage(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { role?: "EDITOR" | "VIEWER" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body kosong atau tidak valid." },
      { status: 400 },
    );
  }

  const { role: newRole } = body;

  if (!newRole || !["EDITOR", "VIEWER"].includes(newRole)) {
    return NextResponse.json(
      { error: "Role (EDITOR/VIEWER) wajib diisi." },
      { status: 400 },
    );
  }

  const { count } = await prisma.mindMapCollaborator.updateMany({
    where: { id: collaboratorId, mindMapId: id },
    data: { role: newRole },
  });

  if (count === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const collaborator = await prisma.mindMapCollaborator.findUnique({
    where: { id: collaboratorId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ data: collaborator });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; collaboratorId: string }> },
) {
  const { id, collaboratorId } = await params;
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getMindMapRole(id, session.user.id);
  if (!canManage(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await prisma.mindMapCollaborator.deleteMany({
    where: { id: collaboratorId, mindMapId: id },
  });

  if (count === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ message: "Deleted" });
}
