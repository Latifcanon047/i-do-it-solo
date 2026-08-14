import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

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

  const mindMap = await prisma.mindMap.findFirst({
    where: { id, userId: session.user.id },
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

  const body = await req.json();

  const mindMap = await prisma.mindMap.updateMany({
    where: { id, userId: session.user.id },
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
  const mindMap = await prisma.mindMap.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!mindMap)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cleanup semua gambar node di Cloudinary dulu — sebelum hapus row DB.
  // Kalau ini gagal, mindmap-nya masih tetap ada, jadi bisa di-retry.
  try {
    const prefix = `mymind/${id}`;
    await cloudinary.api.delete_resources_by_prefix(prefix);
    await cloudinary.api.delete_folder(prefix);
  } catch (err) {
    console.error("Cleanup Cloudinary gagal:", err);
    return NextResponse.json(
      { error: "Gagal membersihkan gambar, coba lagi." },
      { status: 500 },
    );
  }

  await prisma.mindMap.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ message: "Deleted" });
}
