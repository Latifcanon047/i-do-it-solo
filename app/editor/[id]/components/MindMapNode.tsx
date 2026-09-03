"use client";

import { useState, useEffect, useRef } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Minus, Plus, Loader2 } from "lucide-react";
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
import { THEMES, type CanvasTheme } from "@/app/editor/[id]/lib/themes";

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

const THUMBNAIL_HEIGHT = 80;

export default function MindMapNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useReactFlow();

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label as string);
  const [hovered, setHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const nodeTheme =
    THEMES[(data.canvasTheme as CanvasTheme) ?? "dark"] ?? THEMES.dark;
  const bgColor = (data.bgColor as string) || nodeTheme.nodeDefaultBg;
  const borderColor =
    (data.borderColor as string) || nodeTheme.nodeDefaultBorder;
  const iconKey = data.icon as string | undefined;
  const IconComponent = iconKey ? ICON_MAP[iconKey] : null;
  const collapsed = !!data.collapsed;
  const childCount = (data.childCount as number) || 0;
  const hasChildren = childCount > 0;
  const searchMatch = !!data.searchMatch;
  const searchActive = !!data.searchActive;
  const isRoot = !!data.isRoot;
  const isGhost = !!data.isGhost;
  const isDirectChildOfRoot = !!data.isDirectChildOfRoot;
  const onAddChild = data.onAddChild as ((nodeId: string) => void) | undefined;
  const onAddSibling = data.onAddSibling as
    | ((nodeId: string) => void)
    | undefined;
  const onImageFocus = data.onImageFocus as
    | ((nodeId: string) => void)
    | undefined;
  const onLabelChange = data.onLabelChange as
    | ((nodeId: string, label: string) => void)
    | undefined;
  const onToggleCollapse = data.onToggleCollapse as
    | ((nodeId: string, collapsed: boolean) => void)
    | undefined;
  const onImageSettled = data.onImageSettled as (() => void) | undefined;
  const imageUrl = data.imageUrl as string | undefined;
  const imageUploading = !!data.imageUploading;
  const imageFocused = !!data.imageFocused;
  // Saat gambar fokus, ring/tombol node harus "diam" — fokus visual pindah ke gambar
  const nodeVisuallyFocused = selected && !imageFocused;
  const minWidth = isRoot ? 160 : isDirectChildOfRoot ? 140 : 100;
  const minHeight = isRoot ? 48 : isDirectChildOfRoot ? 40 : 32;
  const contentMinWidth =
    minWidth - (isRoot ? 48 : isDirectChildOfRoot ? 32 : 24);
  const contentMaxWidth = 300 - (isRoot ? 48 : isDirectChildOfRoot ? 32 : 24);

  const fontClass = isRoot
    ? "text-base font-semibold"
    : isDirectChildOfRoot
      ? "text-sm font-medium"
      : "text-sm";

  const paddingStyle = isRoot
    ? { padding: "12px 24px" }
    : isDirectChildOfRoot
      ? { padding: "8px 16px" }
      : { padding: "6px 12px" };

  // Shared style — span dan textarea harus identik supaya ukuran gak loncat
  const contentStyle: React.CSSProperties = {
    minWidth: contentMinWidth,
    maxWidth: contentMaxWidth,
    fontFamily: "inherit",
    letterSpacing: "inherit",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textAlign: "center",
    display: "block",
    // line-height eksplisit supaya span == textarea
    lineHeight: isRoot ? "1.5rem" : "1.25rem",
  };

  useEffect(() => {
    if (data.editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- konsumsi command sekali-tembak dari parent (trigger edit mode), lalu reset flag di sistem eksternal (React Flow store)
      setEditing(true);
      updateNodeData(id, { editing: false });
    }
  }, [data.editing]);

  const [prevDataLabel, setPrevDataLabel] = useState(data.label as string);
  if (data.label !== prevDataLabel) {
    setPrevDataLabel(data.label as string);
    setLabel(data.label as string);
  }

  // Cek cache-hit: kalau gambar udah "complete" duluan pas mount, onLoad
  // gak bakal fire — trigger relayout manual di sini sebagai fallback.
  useEffect(() => {
    if (imgRef.current?.complete) {
      onImageSettled?.();
    }
  }, [imageUrl]);

  // Saat masuk edit mode: resize sesuai konten + select semua
  useEffect(() => {
    if (!editing) return;
    const ta = textareaRef.current;
    if (!ta) return;
    autoResize();
    ta.select();
  }, [editing]);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }

  function handleDoubleClick() {
    setEditing(true);
  }

  function handleBlur() {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setEditing(false);
    onLabelChange?.(id, label);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    // Shift+Enter → newline, biarkan default textarea
  }

  function toggleCollapse(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !collapsed;
    updateNodeData(id, { collapsed: next });
    onToggleCollapse?.(id, next);
  }

  function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    onAddChild?.(id);
  }

  function handleAddSibling(e: React.MouseEvent) {
    e.stopPropagation();
    onAddSibling?.(id);
  }

  function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation();
    onImageFocus?.(id);
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
          : nodeVisuallyFocused
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
      className={`relative rounded-xl border-2 shadow-sm text-center cursor-pointer transition ${ringClass} ${edgeIndicatorClass}`}
      style={{
        backgroundColor: bgColor,
        borderColor: borderColor,
        minWidth,
        minHeight,
        width: "max-content",
        maxWidth: 300,
        ...paddingStyle,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />

      {/* Thumbnail: uploading state */}
      {imageUploading && (
        <div
          className="w-full rounded-lg overflow-hidden mb-2 flex items-center justify-center bg-gray-100"
          style={{ height: THUMBNAIL_HEIGHT }}
        >
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Thumbnail: image state */}
      {!imageUploading && imageUrl && (
        <div
          className="relative mb-2 flex justify-center cursor-pointer"
          onClick={handleImageClick}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            className={`rounded-md pointer-events-none object-contain transition ${
              imageFocused ? "ring-2 ring-blue-500" : ""
            }`}
            style={{ maxWidth: 240, maxHeight: 180 }}
            draggable={false}
            onLoad={() => onImageSettled?.()}
          />
        </div>
      )}

      {/* Content area */}
      <div className="flex items-center justify-center gap-1.5">
        {IconComponent && (
          <IconComponent
            size={isRoot ? 18 : isDirectChildOfRoot ? 16 : 14}
            className="text-gray-700 shrink-0"
          />
        )}

        {/* Span dan textarea bergantian di flow normal — tidak ada overlay */}
        {editing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              autoResize();
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            rows={1}
            className={`outline-none bg-transparent font-medium resize-none overflow-hidden ${fontClass}`}
            style={{
              ...contentStyle,
              padding: 0,
              margin: 0,
              border: "none",
              color: data.bgColor ? "#1f2937" : nodeTheme.nodeDefaultText,
            }}
          />
        ) : (
          <span
            className={`font-medium ${fontClass}`}
            style={{
              ...contentStyle,
              color: data.bgColor ? "#1f2937" : nodeTheme.nodeDefaultText,
            }}
          >
            {label || "\u200B"}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} isConnectable={false} />

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

      {nodeVisuallyFocused && !collapsed && (
        <button
          onClick={handleAddChild}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-500 border border-blue-600 shadow flex items-center justify-center text-white hover:bg-blue-600 z-10"
          title="Tambah child node (Tab)"
        >
          <Plus size={10} />
        </button>
      )}

      {nodeVisuallyFocused && !isRoot && (
        <button
          onClick={handleAddSibling}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500 border border-blue-600 shadow flex items-center justify-center text-white hover:bg-blue-600 z-10"
          title="Tambah sibling node (Enter)"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}
