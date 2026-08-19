import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/mail";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    // Validasi input dasar
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Semua field wajib diisi." },
        { status: 400 },
      );
    }

    // Cek apakah email sudah jadi User beneran (sudah verified)
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email sudah terdaftar." },
        { status: 409 },
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

    // Upsert PendingRegistration — timpa kalau email sudah ada di pending
    await prisma.pendingRegistration.upsert({
      where: { email },
      update: {
        name,
        password: hashedPassword,
        token,
        expiresAt,
        createdAt: new Date(),
      },
      create: {
        name,
        email,
        password: hashedPassword,
        token,
        expiresAt,
      },
    });

    // Kirim email — kalau gagal, hapus pending row
    try {
      await sendVerificationEmail(email, token);
    } catch {
      await prisma.pendingRegistration.delete({ where: { email } });
      return NextResponse.json(
        { error: "Gagal mengirim email verifikasi. Coba lagi." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "Berhasil. Cek email kamu untuk verifikasi." },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 },
    );
  }
}
