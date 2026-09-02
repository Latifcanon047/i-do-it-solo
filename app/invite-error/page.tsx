"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const errorMessages: Record<string, string> = {
  invalid: "Link undangan ini tidak valid.",
  expired:
    "Link undangan ini sudah kadaluarsa. Minta pemilik mindmap mengirim ulang undangan.",
  mismatch:
    "Undangan ini ditujukan untuk email lain. Silakan logout, lalu login pakai email yang diundang, baru klik link undangannya lagi.",
};

function InviteErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message =
    (reason && errorMessages[reason]) ||
    "Terjadi kesalahan saat memproses undangan.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          Undangan Bermasalah
        </h1>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <Link
          href="/dashboard"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function InviteErrorPage() {
  return (
    <Suspense fallback={null}>
      <InviteErrorContent />
    </Suspense>
  );
}
