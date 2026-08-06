"use client";

import { useState } from "react";
import {
  Handle,
  Position,
  NodeToolbar,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { Minus } from "lucide-react";
import {
  Star,
  Flag,
  Lightbulb,
  CheckCircle,
  AlertCircle,
  Heart,
  Target,
  Zap,
  BookOpen,
  Calendar,
  Clock,
  Folder,
  Tag,
  MessageCircle,
  User,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

// Preset icon
const ICON_MAP: Record<string, LucideIcon> = {
  star: Star,
  flag: Flag,
  lightbulb: Lightbulb,
  checkCircle: CheckCircle,
  alertCircle: AlertCircle,
  heart: Heart,
  target: Target,
  zap: Zap,
  bookOpen: BookOpen,
  calendar: Calendar,
  clock: Clock,
  folder: Folder,
  tag: Tag,
  messageCircle: MessageCircle,
  user: User,
  briefcase: Briefcase,
};

// Preset warna background
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

// Preset warna border
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

export default function MindMapNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow();

  // State edit label
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label as string);

  // State hover (buat tombol collapse)
  const [hovered, setHovered] = useState(false);

  // Ambil nilai data node (dengan default)
  const bgColor = (data.bgColor as string) || "#FFFFFF";
  const borderColor = (data.borderColor as string) || "#D1D5DB";
  const iconKey = data.icon as string | undefined;
  const IconComponent = iconKey ? ICON_MAP[iconKey] : null;
  const collapsed = !!data.collapsed;
  const childCount = (data.childCount as number) || 0;
  const hasChildren = childCount > 0;
  const searchMatch = !!data.searchMatch;
  const searchActive = !!data.searchActive;

  // Handler edit label
  function handleDoubleClick() {
    setEditing(true);
  }

  function handleBlur() {
    setEditing(false);
    updateNodeData(id, { label });
  }

  // Handler ganti warna & icon
  function setBgColor(color: string) {
    updateNodeData(id, { bgColor: color });
  }

  function setBorderColor(color: string) {
    updateNodeData(id, { borderColor: color });
  }

  function setIcon(key: string | undefined) {
    updateNodeData(id, { icon: key });
  }

  // Handler collapse/expand
  function toggleCollapse(e: React.MouseEvent) {
    e.stopPropagation();
    updateNodeData(id, { collapsed: !collapsed });
  }

  // Tentuin ring highlight: aktif (search) > selected > match (search) > default
  const ringClass = searchActive
    ? "ring-4 ring-orange-400"
    : selected
      ? "ring-2 ring-blue-400"
      : searchMatch
        ? "ring-2 ring-yellow-400"
        : "";

  return (
    <>
      {/* Toolbar ngambang (muncul saat node di-select) */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={12}>
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex flex-col gap-2 max-w-64">
          {/* Section: Fill / background */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 w-8">Fill</span>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setBgColor(color)}
                className={`w-5 h-5 rounded-full border ${
                  bgColor === color ? "ring-2 ring-blue-500" : "border-gray-300"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
            <label className="w-5 h-5 rounded-full border border-gray-300 cursor-pointer relative overflow-hidden bg-gradient-to-br from-red-400 via-yellow-400 to-blue-400">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>

          {/* Section: Border */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 w-8">Border</span>
            {PRESET_BORDERS.map((color) => (
              <button
                key={color}
                onClick={() => setBorderColor(color)}
                className={`w-5 h-5 rounded-full border-2 ${
                  borderColor === color ? "ring-2 ring-blue-500" : ""
                }`}
                style={{ borderColor: color, backgroundColor: "white" }}
              />
            ))}
            <label className="w-5 h-5 rounded-full border-2 border-gray-300 cursor-pointer relative overflow-hidden bg-gradient-to-br from-red-400 via-yellow-400 to-blue-400">
              <input
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>

          {/* Section: Icon */}
          <div className="flex items-start gap-1">
            <span className="text-[10px] text-gray-400 w-8 pt-1">Icon</span>
            <div className="flex flex-wrap gap-1 flex-1">
              <button
                onClick={() => setIcon(undefined)}
                className={`w-6 h-6 rounded flex items-center justify-center border text-[9px] text-gray-400 ${
                  !iconKey ? "ring-2 ring-blue-500" : "border-gray-200"
                }`}
                title="Tanpa icon"
              >
                ✕
              </button>
              {Object.entries(ICON_MAP).map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  className={`w-6 h-6 rounded flex items-center justify-center border hover:bg-gray-50 ${
                    iconKey === key ? "ring-2 ring-blue-500" : "border-gray-200"
                  }`}
                >
                  <Icon size={14} className="text-gray-700" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </NodeToolbar>

      {/* Node utama */}
      <div
        className={`relative px-4 py-2 rounded-xl border-2 shadow-sm min-w-30 text-center cursor-pointer transition ${ringClass}`}
        style={{ backgroundColor: bgColor, borderColor: borderColor }}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Handle type="target" position={Position.Left} />

        <div className="flex items-center justify-center gap-1.5">
          {IconComponent && (
            <IconComponent size={14} className="text-gray-700 shrink-0" />
          )}
          {editing ? (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => e.key === "Enter" && handleBlur()}
              className="text-sm font-medium text-gray-800 outline-none w-full text-center bg-transparent"
            />
          ) : (
            <span className="text-sm font-medium text-gray-800">{label}</span>
          )}
        </div>

        <Handle type="source" position={Position.Right} />

        {/* Tombol collapse/expand */}
        {hasChildren && (hovered || collapsed) && (
          <button
            onClick={toggleCollapse}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute -right-2 -bottom-2 w-5 h-5 rounded-full bg-white border border-gray-300 shadow flex items-center justify-center text-[10px] font-semibold text-gray-600 hover:bg-gray-50 z-10"
            title={
              collapsed ? `Expand (${childCount} tersembunyi)` : "Collapse"
            }
          >
            {collapsed ? childCount : <Minus size={10} />}
          </button>
        )}
      </div>
    </>
  );
}
