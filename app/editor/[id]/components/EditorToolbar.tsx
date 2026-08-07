"use client";

import { Palette, Search } from "lucide-react";

type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  title: string;
  saveStatus: SaveStatus;
  onBack: () => void;
  onSearchClick: () => void;
  onStyleClick: () => void;
  styleOpen: boolean;
}

export default function EditorToolbar({
  title,
  saveStatus,
  onBack,
  onSearchClick,
  onStyleClick,
  styleOpen,
}: Props) {
  return (
    <div className="bg-white border-b px-4 py-2 flex items-center gap-3">
      <button
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-800"
      >
        ← Dashboard
      </button>
      <span className="text-sm font-semibold text-gray-800">{title}</span>

      {saveStatus === "saving" && (
        <span className="text-xs text-yellow-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          Saving...
        </span>
      )}
      {saveStatus === "saved" && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Saved
        </span>
      )}

      <div className="flex-1" />

      {/* Tombol Search */}
      <button
        onClick={onSearchClick}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
        title="Cari node (Ctrl+F)"
      >
        <Search size={16} />
      </button>

      {/* Tombol Style Sidebar */}
      <button
        onClick={onStyleClick}
        className={`p-1.5 rounded-lg transition ${
          styleOpen
            ? "bg-blue-100 text-blue-600"
            : "text-gray-500 hover:bg-gray-100"
        }`}
        title="Style node (warna & icon)"
      >
        <Palette size={16} />
      </button>
    </div>
  );
}
