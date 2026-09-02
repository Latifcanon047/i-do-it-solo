import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import EditorClient from "./components/EditorClient";
import { getMindMapRole } from "@/lib/permissions";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user) redirect("/login");

  const role = await getMindMapRole(id, session.user.id!);
  if (!role) redirect("/dashboard");

  const mindMap = await prisma.mindMap.findUnique({ where: { id } });
  if (!mindMap) redirect("/dashboard");

  return <EditorClient mindMap={mindMap} role={role} />;
}
