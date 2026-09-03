import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/auth";
import { getMindMapRole, canEdit } from "@/lib/permissions";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { sourceUrl, mindMapId, newNodeId } = await request.json();

    if (!sourceUrl || !mindMapId || !newNodeId) {
      return NextResponse.json(
        { error: "sourceUrl, mindMapId, dan newNodeId wajib diisi." },
        { status: 400 },
      );
    }

    const role = await getMindMapRole(mindMapId, session.user.id);
    if (!canEdit(role)) {
      return NextResponse.json(
        { error: "Mindmap tidak ditemukan." },
        { status: 404 },
      );
    }

    const uploadResult = await cloudinary.uploader.upload(sourceUrl, {
      folder: `mymind/${mindMapId}/${newNodeId}`,
      resource_type: "image",
      transformation: [
        { width: 2048, height: 2048, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    return NextResponse.json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    });
  } catch (err) {
    console.error("Duplicate gambar ke Cloudinary gagal:", err);
    return NextResponse.json(
      { error: "Duplicate gambar gagal, coba lagi." },
      { status: 500 },
    );
  }
}
