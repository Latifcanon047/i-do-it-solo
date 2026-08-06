"use client";

import { Search } from "lucide-react";

type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  title: string;
  saveStatus: SaveStatus;
  onAddNode: () => void;
  onDeleteSelected: () => void;
  onBack: () => void;
  onSearchClick: () => void;
}

export default function EditorToolbar({
  title,
  saveStatus,
  onAddNode,
  onDeleteSelected,
  onBack,
  onSearchClick,
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

      <button
        onClick={onSearchClick}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
        title="Cari node (Ctrl+F)"
      >
        <Search size={16} />
      </button>
      <button
        onClick={onAddNode}
        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
      >
        + Add Node
      </button>
      <button
        onClick={onDeleteSelected}
        className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-600"
      >
        Delete Selected
      </button>
    </div>
  );
}
