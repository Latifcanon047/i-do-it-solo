import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || !session.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mindMaps = await prisma.mindMap.findMany({
    where: { userId: session.user.id! },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(mindMaps);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title } = await req.json();

  const mindMap = await prisma.mindMap.create({
    data: {
      title,
      userId: session.user.id!,
      content: {
        nodes: [
          {
            id: "root",
            type: "mindmap",
            position: { x: 0, y: 0 },
            data: { label: title, isRoot: true },
          },
        ],
        edges: [],
      },
    },
  });

  return NextResponse.json(mindMap);
}
