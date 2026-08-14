import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mindMapId = formData.get("mindMapId") as string | null;
    const nodeId = formData.get("nodeId") as string | null;

    if (!file || !mindMapId || !nodeId) {
      return NextResponse.json(
        { error: "File, mindMapId, dan nodeId wajib diisi." },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Format file harus JPG, PNG, atau WebP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file maksimal 10MB." },
        { status: 400 },
      );
    }

    const mindMap = await prisma.mindMap.findFirst({
      where: { id: mindMapId, userId: session.user.id },
      select: { id: true },
    });
    if (!mindMap) {
      return NextResponse.json(
        { error: "Mindmap tidak ditemukan." },
        { status: 404 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await new Promise<{
      secure_url: string;
      public_id: string;
    }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `mymind/${mindMapId}/${nodeId}`,
          resource_type: "image",
          transformation: [
            { width: 2048, height: 2048, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
        },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );
      uploadStream.end(buffer);
    });

    return NextResponse.json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    });
  } catch (err) {
    console.error("Upload ke Cloudinary gagal:", err);
    return NextResponse.json(
      { error: "Upload gagal, coba lagi." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { publicId } = await request.json();

    if (!publicId) {
      return NextResponse.json(
        { error: "publicId wajib diisi." },
        { status: 400 },
      );
    }

    // publicId formatnya "mymind/{mindMapId}/{nodeId}/xxx" — extract
    // mindMapId buat verify ownership sebelum destroy.
    const parts = publicId.split("/");
    const mindMapId = parts[1];
    if (parts[0] !== "mymind" || !mindMapId) {
      return NextResponse.json(
        { error: "publicId tidak valid." },
        { status: 400 },
      );
    }

    const mindMap = await prisma.mindMap.findFirst({
      where: { id: mindMapId, userId: session.user.id },
      select: { id: true },
    });
    if (!mindMap) {
      return NextResponse.json(
        { error: "Mindmap tidak ditemukan." },
        { status: 404 },
      );
    }

    await cloudinary.uploader.destroy(publicId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Hapus dari Cloudinary gagal:", err);
    return NextResponse.json(
      { error: "Hapus gagal, coba lagi." },
      { status: 500 },
    );
  }
}
