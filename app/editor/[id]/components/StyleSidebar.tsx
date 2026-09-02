"use client";

import { type Node } from "@xyflow/react";
import { X } from "lucide-react";
import { ICON_MAP } from "./MindMapNode";
import { useMindMapStore } from "@/store/mindMapStore";

const PRESET_COLORS = [
  "#FFFFFF",
  "#FEE2E2",
  "#FFEDD5",
  "#FEF9C3",
  "#DCFCE7",
  "#DBEAFE",
  "#EDE9FE",
  "#FCE7F3",
];

const PRESET_BORDERS = [
  "#D1D5DB",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
];

interface Props {
  selectedNode: Node | null;
  onClose: () => void;
}

export default function StyleSidebar({ selectedNode, onClose }: Props) {
  const updateNodeStyle = useMindMapStore((s) => s.updateNodeStyle);
  const hasSelection = !!selectedNode;
  const bgColor = (selectedNode?.data?.bgColor as string) || "#FFFFFF";
  const borderColor = (selectedNode?.data?.borderColor as string) || "#D1D5DB";
  const iconKey = selectedNode?.data?.icon as string | undefined;

  function setBgColor(color: string) {
    if (!selectedNode) return;
    updateNodeStyle(selectedNode.id, { bgColor: color });
  }

  function setBorderColor(color: string) {
    if (!selectedNode) return;
    updateNodeStyle(selectedNode.id, { borderColor: color });
  }

  function setIcon(key: string | undefined) {
    if (!selectedNode) return;
    updateNodeStyle(selectedNode.id, { icon: key });
  }

  return (
    <div className="absolute top-0 right-0 h-full w-64 bg-white border-l border-gray-200 shadow-lg z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Style Node</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div
        className={`flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5 transition-opacity ${!hasSelection ? "opacity-40 pointer-events-none" : ""}`}
      >
        {/* Fill */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Fill</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setBgColor(color)}
                className={`w-7 h-7 rounded-full border transition ${
                  hasSelection && bgColor === color
                    ? "ring-2 ring-offset-1 ring-blue-500 border-transparent"
                    : "border-gray-300"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              className="w-7 h-7 rounded-full border border-gray-300 cursor-pointer relative overflow-hidden bg-gradient-to-br from-red-400 via-yellow-400 to-blue-400"
              title="Custom color"
            >
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
          </div>
        </div>

        {/* Border */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Border</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_BORDERS.map((color) => (
              <button
                key={color}
                onClick={() => setBorderColor(color)}
                className={`w-7 h-7 rounded-full border-2 transition ${
                  hasSelection && borderColor === color
                    ? "ring-2 ring-offset-1 ring-blue-500"
                    : ""
                }`}
                style={{ borderColor: color, backgroundColor: "white" }}
              />
            ))}
            <label
              className="w-7 h-7 rounded-full border-2 border-gray-300 cursor-pointer relative overflow-hidden bg-gradient-to-br from-red-400 via-yellow-400 to-blue-400"
              title="Custom color"
            >
              <input
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
          </div>
        </div>

        {/* Icon */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setIcon(undefined)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border text-xs text-gray-400 transition hover:bg-gray-50 ${
                hasSelection && !iconKey
                  ? "ring-2 ring-blue-500 border-blue-300"
                  : "border-gray-200"
              }`}
              title="Tanpa icon"
            >
              ✕
            </button>
            {Object.entries(ICON_MAP).map(([key, Icon]) => (
              <button
                key={key}
                onClick={() => setIcon(key)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center border transition hover:bg-gray-50 ${
                  hasSelection && iconKey === key
                    ? "ring-2 ring-blue-500 border-blue-300"
                    : "border-gray-200"
                }`}
                title={key}
              >
                <Icon size={15} className="text-gray-700" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hint kecil di bawah kalau gak ada selection */}
      {!hasSelection && (
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 text-center">
            Klik node untuk mengedit style
          </p>
        </div>
      )}
    </div>
  );
}
