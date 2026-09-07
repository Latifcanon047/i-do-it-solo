import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DELETE_CHUNK_SIZE = 100; // limit Admin API: maks 100 public_id per call

interface CloudinaryResource {
  public_id: string;
  created_at: string;
}

interface MindMapNodeData {
  imagePublicId?: string;
}

interface MindMapContent {
  nodes?: { data?: MindMapNodeData }[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function getUsedPublicIds(content: unknown): Set<string> {
  const parsed = content as MindMapContent;
  const ids = (parsed?.nodes ?? [])
    .map((n) => n.data?.imagePublicId)
    .filter((id): id is string => !!id);
  return new Set(ids);
}

// Ambil SEMUA resource di bawah folder mindmap ini, dengan pagination
// (max_results dibatasi 500 per call oleh Cloudinary, butuh next_cursor
// kalau resource-nya lebih banyak dari itu).
async function listAllResourcesForMindMap(
  mindMapId: string,
): Promise<CloudinaryResource[]> {
  const resources: CloudinaryResource[] = [];
  let nextCursor: string | undefined = undefined;

  do {
    const res = await cloudinary.api.resources({
      type: "upload",
      prefix: `mymind/${mindMapId}/`,
      max_results: 500,
      next_cursor: nextCursor,
    });
    resources.push(...(res.resources as CloudinaryResource[]));
    nextCursor = res.next_cursor;
  } while (nextCursor);

  return resources;
}

interface MindMapCleanupSummary {
  mindMapId: string;
  mindMapTitle: string;
  totalResourcesInCloudinary: number;
  orphanCount: number;
  orphanPublicIds: string[];
  deleted: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CLEANUP_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    const mindMaps = await prisma.mindMap.findMany({
      select: { id: true, title: true, content: true },
    });

    const summaries: MindMapCleanupSummary[] = [];
    const cutoff = Date.now() - ONE_DAY_MS;

    for (const mindMap of mindMaps) {
      try {
        const usedPublicIds = getUsedPublicIds(mindMap.content);
        const resources = await listAllResourcesForMindMap(mindMap.id);

        const orphans = resources.filter((r) => {
          if (usedPublicIds.has(r.public_id)) return false;
          const createdAt = new Date(r.created_at).getTime();
          return createdAt < cutoff;
        });

        const orphanPublicIds = orphans.map((r) => r.public_id);

        if (!dryRun && orphanPublicIds.length > 0) {
          for (const batch of chunk(orphanPublicIds, DELETE_CHUNK_SIZE)) {
            await cloudinary.api.delete_resources(batch);
          }
        }

        summaries.push({
          mindMapId: mindMap.id,
          mindMapTitle: mindMap.title,
          totalResourcesInCloudinary: resources.length,
          orphanCount: orphanPublicIds.length,
          orphanPublicIds,
          deleted: !dryRun && orphanPublicIds.length > 0,
        });
      } catch (err) {
        summaries.push({
          mindMapId: mindMap.id,
          mindMapTitle: mindMap.title,
          totalResourcesInCloudinary: 0,
          orphanCount: 0,
          orphanPublicIds: [],
          deleted: false,
          error: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    }

    const totalOrphans = summaries.reduce((sum, s) => sum + s.orphanCount, 0);

    return NextResponse.json({
      dryRun,
      mindMapsProcessed: mindMaps.length,
      totalOrphansFound: totalOrphans,
      summaries,
    });
  } catch (err) {
    console.error("Cleanup images gagal:", err);
    return NextResponse.json(
      { error: "Cleanup gagal, coba lagi." },
      { status: 500 },
    );
  }
}
