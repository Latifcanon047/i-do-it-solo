"use client";

import {
  Palette,
  Search,
  Sun,
  Moon,
  Leaf,
  Waves,
  Sparkles,
  Users,
} from "lucide-react";
import type { CanvasTheme } from "@/app/editor/[id]/lib/themes";

type SaveStatus = "idle" | "saving" | "saved";

interface Props {
  title: string;
  saveStatus: SaveStatus;
  onBack: () => void;
  onSearchClick: () => void;
  onStyleClick: () => void;
  styleOpen: boolean;
  canvasTheme: CanvasTheme;
  onThemeChange: (theme: CanvasTheme) => void;
  onManageAccessClick: () => void;
}

const THEME_OPTIONS: {
  value: CanvasTheme;
  icon: React.ReactNode;
  label: string;
}[] = [
  { value: "light", icon: <Sun size={14} />, label: "Light" },
  { value: "dark", icon: <Moon size={14} />, label: "Dark" },
  { value: "soft", icon: <Leaf size={14} />, label: "Soft" },
  { value: "ocean", icon: <Waves size={14} />, label: "Ocean" },
  { value: "nebula", icon: <Sparkles size={14} />, label: "Nebula" },
];

export default function EditorToolbar({
  title,
  saveStatus,
  onBack,
  onSearchClick,
  onStyleClick,
  styleOpen,
  canvasTheme,
  onThemeChange,
  onManageAccessClick,
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
        onClick={onManageAccessClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200"
        title="Kelola akses"
      >
        <Users size={15} />
        <span>Manage Access</span>
      </button>

      <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onThemeChange(opt.value)}
            title={opt.label}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition ${
              canvasTheme === opt.value
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onSearchClick}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
        title="Cari node (Ctrl+F)"
      >
        <Search size={16} />
      </button>

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
