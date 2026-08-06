import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

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

  await prisma.mindMap.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ message: "Deleted" });
}
