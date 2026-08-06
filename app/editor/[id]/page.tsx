import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import EditorClient from "./components/EditorClient";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user) redirect("/login");

  const mindMap = await prisma.mindMap.findFirst({
    where: { id, userId: session.user.id! },
  });

  if (!mindMap) redirect("/dashboard");

  return <EditorClient mindMap={mindMap} />;
}
