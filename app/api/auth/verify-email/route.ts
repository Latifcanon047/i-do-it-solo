import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sanitizeCallbackUrl } from "@/lib/callbackUrl";
import { convertPendingInvites } from "@/lib/invites";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const safeCallbackUrl = sanitizeCallbackUrl(
      searchParams.get("callbackUrl"),
    );

    if (!token) {
      return NextResponse.redirect(
        new URL("/login?verify=missing_token", req.url),
      );
    }

    // Cari token di PendingRegistration
    const pending = await prisma.pendingRegistration.findUnique({
      where: { token },
    });

    if (!pending) {
      return NextResponse.redirect(new URL("/login?verify=invalid", req.url));
    }

    if (pending.expiresAt < new Date()) {
      // Hapus pending yang sudah expired
      await prisma.pendingRegistration.delete({ where: { token } });
      return NextResponse.redirect(new URL("/login?verify=expired", req.url));
    }

    // Buat User beneran
    const newUser = await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        password: pending.password,
        emailVerified: new Date(),
      },
    });

    // Convert PendingInvite (kalau ada) jadi akses langsung — gagal di sini
    // gak boleh gagalin proses verifikasi user
    try {
      await convertPendingInvites(newUser.id, newUser.email);
    } catch (err) {
      console.error("Gagal convert pending invites (verify-email):", err);
    }

    // Hapus PendingRegistration
    await prisma.pendingRegistration.delete({ where: { token } });

    const loginUrl = new URL("/login?verify=success", req.url);
    if (safeCallbackUrl)
      loginUrl.searchParams.set("callbackUrl", safeCallbackUrl);
    return NextResponse.redirect(loginUrl);
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 },
    );
  }
}
