import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

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
    await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        password: pending.password,
        emailVerified: new Date(),
      },
    });

    // Hapus PendingRegistration
    await prisma.pendingRegistration.delete({ where: { token } });

    return NextResponse.redirect(new URL("/login?verify=success", req.url));
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 },
    );
  }
}
