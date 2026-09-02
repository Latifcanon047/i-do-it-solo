import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { getMindMapRole, canView, canEdit, canManage } from "@/lib/permissions";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getMindMapRole(id, session.user.id);
  if (!canView(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mindMap = await prisma.mindMap.findUnique({
    where: { id },
  });

  if (!mindMap)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(mindMap);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body kosong atau tidak valid." },
      { status: 400 },
    );
  }

  const role = await getMindMapRole(id, session.user.id);
  if (!canEdit(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mindMap = await prisma.mindMap.updateMany({
    where: { id },
    data: body,
  });

  return NextResponse.json(mindMap);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verifikasi dulu mindmap ini beneran punya user ini sebelum hapus apapun
  // Verifikasi dulu mindmap ini beneran punya user ini sebelum hapus apapun
  const role = await getMindMapRole(id, session.user.id);
  if (!canManage(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mindMap = await prisma.mindMap.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!mindMap)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prefix = `mymind/${id}`;

  try {
    await cloudinary.api.delete_resources_by_prefix(prefix);
  } catch (err) {
    console.error("Cleanup Cloudinary gagal:", err);
    return NextResponse.json(
      { error: "Gagal membersihkan gambar, coba lagi." },
      { status: 500 },
    );
  }

  try {
    await cloudinary.api.delete_folder(prefix);
  } catch (err) {
    // Folder emang gak akan ada kalau mindmap ini gak pernah punya gambar.
    // Ini bukan kegagalan cleanup, jadi jangan block proses delete.
    console.warn("Skip delete_folder (folder mungkin memang tidak ada):", err);
  }

  await prisma.mindMap.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ message: "Deleted" });
}
