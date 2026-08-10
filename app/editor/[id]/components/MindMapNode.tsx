"use client";

import { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Minus, Plus } from "lucide-react";
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
import { useMindMapStore } from "@/store/mindMapStore";

export const ICON_MAP: Record<string, LucideIcon> = {
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

export default function MindMapNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const addChild = useMindMapStore((s) => s.addChild);
  const addSibling = useMindMapStore((s) => s.addSibling);

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label as string);
  const [hovered, setHovered] = useState(false);

  const bgColor = (data.bgColor as string) || "#FFFFFF";
  const borderColor = (data.borderColor as string) || "#D1D5DB";
  const iconKey = data.icon as string | undefined;
  const IconComponent = iconKey ? ICON_MAP[iconKey] : null;
  const collapsed = !!data.collapsed;
  const childCount = (data.childCount as number) || 0;
  const hasChildren = childCount > 0;
  const searchMatch = !!data.searchMatch;
  const searchActive = !!data.searchActive;
  const isRoot = !!data.isRoot;
  const isGhost = !!data.isGhost;

  useEffect(() => {
    if (data.editing) {
      setEditing(true);
      updateNodeData(id, { editing: false });
    }
  }, [data.editing]);

  function handleDoubleClick() {
    setEditing(true);
  }

  function handleBlur() {
    setEditing(false);
    updateNodeData(id, { label });
  }

  function toggleCollapse(e: React.MouseEvent) {
    e.stopPropagation();
    updateNodeData(id, { collapsed: !collapsed });
  }

  function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    addChild(id);
  }

  function handleAddSibling(e: React.MouseEvent) {
    e.stopPropagation();
    addSibling(id);
  }

  const dropZone = data.dropZone as
    | "before"
    | "after"
    | "child"
    | "blocked"
    | null
    | undefined;

  const ringClass =
    dropZone === "blocked"
      ? "ring-4 ring-red-500 opacity-60"
      : dropZone === "child"
        ? "ring-4 ring-green-500"
        : searchActive
          ? "ring-4 ring-orange-400"
          : selected
            ? "ring-2 ring-blue-400"
            : searchMatch
              ? "ring-2 ring-yellow-400"
              : "";
  const edgeIndicatorClass =
    dropZone === "before"
      ? "border-t-4 border-t-blue-500"
      : dropZone === "after"
        ? "border-b-4 border-b-blue-500"
        : "";
  if (isGhost) {
    return (
      <div className="px-4 py-2 min-w-30 rounded-xl border-2 border-dashed border-pink-500 bg-pink-200 text-pink-700 text-sm font-medium text-center pointer-events-none select-none">
        {label}
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-xl border-2 shadow-sm text-center cursor-pointer transition ${
        isRoot
          ? "px-6 py-4 min-w-40 border-[3px] shadow-md"
          : "px-4 py-2 min-w-30"
      } ${ringClass} ${edgeIndicatorClass}`}
      style={{ backgroundColor: bgColor, borderColor: borderColor }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />

      <div className="flex items-center justify-center gap-1.5">
        {IconComponent && (
          <IconComponent
            size={isRoot ? 18 : 14}
            className="text-gray-700 shrink-0"
          />
        )}
        {editing ? (
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === "Enter" && handleBlur()}
            className={`outline-none w-full text-center bg-transparent text-gray-800 font-medium ${
              isRoot ? "text-base font-semibold" : "text-sm"
            }`}
          />
        ) : (
          <span
            className={`text-gray-800 font-medium ${isRoot ? "text-base font-semibold" : "text-sm"}`}
          >
            {label}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} isConnectable={false} />
      {/* Tombol collapse/expand */}
      {hasChildren && (hovered || collapsed) && (
        <button
          onClick={toggleCollapse}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -right-2 -bottom-2 w-5 h-5 rounded-full bg-white border border-gray-300 shadow flex items-center justify-center text-[10px] font-semibold text-gray-600 hover:bg-gray-50 z-10"
          title={collapsed ? `Expand (${childCount} tersembunyi)` : "Collapse"}
        >
          {collapsed ? childCount : <Minus size={10} />}
        </button>
      )}

      {/* Tombol + kanan → tambah child (sama seperti Tab) */}
      {hovered && !collapsed && (
        <button
          onClick={handleAddChild}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -right-2 -top-2 w-5 h-5 rounded-full bg-blue-500 border border-blue-600 shadow flex items-center justify-center text-white hover:bg-blue-600 z-10"
          title="Tambah child node (Tab)"
        >
          <Plus size={10} />
        </button>
      )}

      {/* Tombol + bawah → tambah sibling (sama seperti Enter), tidak muncul di root */}
      {hovered && !isRoot && (
        <button
          onClick={handleAddSibling}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-blue-500 border border-blue-600 shadow flex items-center justify-center text-white hover:bg-blue-600 z-10"
          title="Tambah sibling node (Enter)"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}
