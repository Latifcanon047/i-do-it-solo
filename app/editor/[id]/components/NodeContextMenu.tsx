"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, ChevronRight, Copy, ClipboardPaste } from "lucide-react";

interface NodeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onInsertImage: () => void;
  onCopy: () => void;
  onPaste: () => void;
  pasteDisabled: boolean;
}

const MENU_WIDTH = 192; // w-48
const MENU_ITEM_HEIGHT = 34; // approx per row incl. padding
const SUBMENU_WIDTH = 160; // w-40

export default function NodeContextMenu({
  x,
  y,
  onClose,
  onInsertImage,
  onCopy,
  onPaste,
  pasteDisabled,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });
  const [submenuSide, setSubmenuSide] = useState<"right" | "left">("right");

  // Clamp posisi menu utama supaya gak overflow keluar viewport
  useEffect(() => {
    const menuHeight = MENU_ITEM_HEIGHT * 3 + 8; // 3 item + padding vertikal
    const maxLeft = window.innerWidth - MENU_WIDTH - 8;
    const maxTop = window.innerHeight - menuHeight - 8;
    const clampedLeft = Math.min(x, Math.max(8, maxLeft));
    const clampedTop = Math.min(y, Math.max(8, maxTop));
    setPos({ left: clampedLeft, top: clampedTop });

    // Kalau menu utama ketempel deket kanan viewport, submenu buka ke kiri
    const wouldOverflowRight =
      clampedLeft + MENU_WIDTH + SUBMENU_WIDTH > window.innerWidth - 8;
    setSubmenuSide(wouldOverflowRight ? "left" : "right");
  }, [x, y]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] w-48 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl text-sm"
      style={{ left: pos.left, top: pos.top }}
    >
      <div
        className="relative"
        onMouseEnter={() => setInsertOpen(true)}
        onMouseLeave={() => setInsertOpen(false)}
      >
        <button
          className="flex w-full items-center justify-between px-3 py-1.5 text-slate-200 hover:bg-slate-800"
          type="button"
        >
          <span>Insert</span>
          <ChevronRight size={14} />
        </button>

        {insertOpen && (
          <div
            className={`absolute top-0 w-40 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl ${
              submenuSide === "right" ? "left-full" : "right-full"
            }`}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
              type="button"
              onClick={() => {
                onInsertImage();
                onClose();
              }}
            >
              <ImageIcon size={14} />
              <span>Image</span>
            </button>
          </div>
        )}
      </div>

      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
        type="button"
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        <Copy size={14} />
        <span>Copy</span>
      </button>

      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        type="button"
        disabled={pasteDisabled}
        onClick={() => {
          if (pasteDisabled) return;
          onPaste();
          onClose();
        }}
      >
        <ClipboardPaste size={14} />
        <span>Paste</span>
      </button>
    </div>
  );
}