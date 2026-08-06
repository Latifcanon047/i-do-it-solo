import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import DashboardClient from "./components/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();

  if (!session || !session.user) redirect("/login");

  const mindMaps = await prisma.mindMap.findMany({
    where: { userId: session.user.id! },
    orderBy: { updatedAt: "desc" },
  });

  return <DashboardClient mindMaps={mindMaps} user={session.user} />;
}
