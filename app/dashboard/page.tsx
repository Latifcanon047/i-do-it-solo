import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import DashboardClient from "./components/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();

  if (!session || !session.user) redirect("/login");

  const userId = session.user.id!;

  const [ownedMaps, collaboratingMaps] = await Promise.all([
    prisma.mindMap.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.mindMapCollaborator.findMany({
      where: { userId },
      include: { mindMap: true },
      orderBy: { mindMap: { updatedAt: "desc" } },
    }),
  ]);

  const mindMaps = [
    ...ownedMaps.map((m) => ({ ...m, role: "OWNER" as const })),
    ...collaboratingMaps.map((c) => ({ ...c.mindMap, role: c.role })),
  ].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return <DashboardClient mindMaps={mindMaps} user={session.user} />;
}
