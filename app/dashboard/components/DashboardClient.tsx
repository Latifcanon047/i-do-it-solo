//DashboardClient.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

interface MindMap {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  mindMaps: MindMap[];
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
  };
}

export default function DashboardClient({ mindMaps, user }: Props) {
  const router = useRouter();
  const [maps, setMaps] = useState<MindMap[]>(mindMaps);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    const res = await fetch("/api/mindmaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Mind Map" }),
    });
    const data = await res.json();
    setLoading(false);
    router.push(`/editor/${data.id}`);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus mind map ini?")) return;
    await fetch(`/api/mindmaps/${id}`, { method: "DELETE" });
    setMaps((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleRename(id: string, currentTitle: string) {
    const title = prompt("Nama baru:", currentTitle);
    if (!title || title === currentTitle) return;
    await fetch(`/api/mindmaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, title } : m)));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">MyMind</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-red-500 hover:underline"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-700">
            Mind Maps Saya
          </h2>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Membuat..." : "+ New Mind Map"}
          </button>
        </div>

        {maps.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">Belum ada mind map</p>
            <p className="text-sm mt-1">
              Klik tombol di atas untuk membuat yang pertama
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {maps.map((map) => (
              <div
                key={map.id}
                className="bg-white rounded-xl border hover:shadow-md transition cursor-pointer p-5"
                onClick={() => router.push(`/editor/${map.id}`)}
              >
                <h3 className="font-semibold text-gray-800 truncate">
                  {map.title}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(map.updatedAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRename(map.id, map.title);
                    }}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(map.id);
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
