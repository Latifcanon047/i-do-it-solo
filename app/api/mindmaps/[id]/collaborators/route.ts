import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getMindMapRole, canManage, canView } from "@/lib/permissions";
import {
  sendInviteToExistingUserEmail,
  sendInviteToNewUserEmail,
} from "@/lib/mail";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getMindMapRole(id, session.user.id);
  if (!canView(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [collaborators, pendingInvites] = await Promise.all([
    prisma.mindMapCollaborator.findMany({
      where: { mindMapId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.pendingInvite.findMany({
      where: { mindMapId: id },
    }),
  ]);

  return NextResponse.json({ collaborators, pendingInvites });
}

type InviteItem = { email?: string; role?: "EDITOR" | "VIEWER" };

type InviteResult =
  | { email: string; success: true; type: "collaborator" | "pendingInvite" }
  | { email: string; success: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getMindMapRole(id, session.user.id);
  if (!canManage(role))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { invites?: InviteItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body kosong atau tidak valid." },
      { status: 400 },
    );
  }

  const { invites } = body;

  if (!Array.isArray(invites) || invites.length === 0) {
    return NextResponse.json(
      { error: "Daftar invites wajib diisi." },
      { status: 400 },
    );
  }

  const mindMap = await prisma.mindMap.findUnique({
    where: { id },
    select: { title: true, userId: true },
  });
  if (!mindMap)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ownerUser = await prisma.user.findUnique({
    where: { id: mindMap.userId },
    select: { email: true },
  });

  const results: InviteResult[] = [];

  for (const item of invites) {
    const { email, role: inviteRole } = item;

    if (!email || !inviteRole || !["EDITOR", "VIEWER"].includes(inviteRole)) {
      results.push({
        email: email ?? "(kosong)",
        success: false,
        error: "Email dan role (EDITOR/VIEWER) wajib diisi.",
      });
      continue;
    }

    if (!EMAIL_REGEX.test(email)) {
      results.push({
        email,
        success: false,
        error: "Format email tidak valid.",
      });
      continue;
    }

    if (ownerUser?.email === email) {
      results.push({
        email,
        success: false,
        error: "Tidak bisa invite diri sendiri.",
      });
      continue;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const previousCollaborator = await prisma.mindMapCollaborator.findUnique({
        where: {
          mindMapId_userId: { mindMapId: id, userId: existingUser.id },
        },
      });

      await prisma.mindMapCollaborator.upsert({
        where: {
          mindMapId_userId: { mindMapId: id, userId: existingUser.id },
        },
        update: { role: inviteRole },
        create: { mindMapId: id, userId: existingUser.id, role: inviteRole },
      });

      try {
        await sendInviteToExistingUserEmail(
          email,
          mindMap.title,
          inviteRole,
          id,
        );
      } catch {
        if (previousCollaborator) {
          await prisma.mindMapCollaborator.update({
            where: {
              mindMapId_userId: { mindMapId: id, userId: existingUser.id },
            },
            data: { role: previousCollaborator.role },
          });
        } else {
          await prisma.mindMapCollaborator.delete({
            where: {
              mindMapId_userId: { mindMapId: id, userId: existingUser.id },
            },
          });
        }
        results.push({
          email,
          success: false,
          error: "Gagal mengirim email notifikasi, undangan dibatalkan.",
        });
        continue;
      }

      results.push({ email, success: true, type: "collaborator" });
      continue;
    }

    const previousPendingInvite = await prisma.pendingInvite.findUnique({
      where: { mindMapId_email: { mindMapId: id, email } },
    });

    const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const token = crypto.randomUUID();

    const pendingInvite = await prisma.pendingInvite.upsert({
      where: { mindMapId_email: { mindMapId: id, email } },
      update: { role: inviteRole, expiresAt, token },
      create: { mindMapId: id, email, role: inviteRole, expiresAt, token },
    });

    try {
      await sendInviteToNewUserEmail(
        email,
        mindMap.title,
        inviteRole,
        pendingInvite.token,
      );
    } catch {
      if (previousPendingInvite) {
        await prisma.pendingInvite.update({
          where: { mindMapId_email: { mindMapId: id, email } },
          data: {
            role: previousPendingInvite.role,
            expiresAt: previousPendingInvite.expiresAt,
            token: previousPendingInvite.token,
          },
        });
      } else {
        await prisma.pendingInvite.delete({
          where: { mindMapId_email: { mindMapId: id, email } },
        });
      }
      results.push({
        email,
        success: false,
        error: "Gagal mengirim email undangan, dibatalkan.",
      });
      continue;
    }

    results.push({ email, success: true, type: "pendingInvite" });
  }

  return NextResponse.json({ results });
}
