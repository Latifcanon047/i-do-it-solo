"use client";

import { useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
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

  const ringClass = searchActive
    ? "ring-4 ring-orange-400"
    : selected
      ? "ring-2 ring-blue-400"
      : searchMatch
        ? "ring-2 ring-yellow-400"
        : "";

  return (
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
          title={collapsed ? `Expand (${childCount} tersembunyi)` : "Collapse"}
        >
          {collapsed ? childCount : <Minus size={10} />}
        </button>
      )}
    </div>
  );
}
