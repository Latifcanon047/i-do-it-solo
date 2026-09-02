import { NextRequest, NextResponse } from "next/server";
import { Liveblocks } from "@liveblocks/node";
import { auth } from "@/auth";
import { getMindMapRole, canView, canEdit } from "@/lib/permissions";

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

// BARU — Fase 3: palette warna cursor, dipilih random pas authorize
const CURSOR_COLORS = [
  "#F87171", // red
  "#FB923C", // orange
  "#FBBF24", // amber
  "#34D399", // emerald
  "#22D3EE", // cyan
  "#60A5FA", // blue
  "#A78BFA", // violet
  "#F472B6", // pink
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room } = await req.json();

  // Room ID = mindmap ID (sesuai kesepakatan Q2)
  const role = await getMindMapRole(room, session.user.id);

  if (!canView(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // BARU — Fase 3
  const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

  const session_ = liveblocks.prepareSession(session.user.id, {
    userInfo: {
      name: session.user.name ?? "Unknown",
      color,
    },
  });

  // Owner & Editor dapet akses full (read + write), Viewer cuma read-only
  if (canEdit(role)) {
    session_.allow(room, session_.FULL_ACCESS);
  } else {
    session_.allow(room, session_.READ_ACCESS);
  }

  const { status, body } = await session_.authorize();

  return new NextResponse(body, { status });
}
