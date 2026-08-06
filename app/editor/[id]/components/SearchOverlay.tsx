"use client";

import { useEffect, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";

interface MatchItem {
  id: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  matches: MatchItem[];
  currentIndex: number; // -1 kalau belum ada yang aktif
  onNext: () => void;
  onPrev: () => void;
  onSelect: (index: number) => void; // klik salah satu item di list
  onClose: () => void;
}

export default function SearchOverlay({
  value,
  onChange,
  matches,
  currentIndex,
  onNext,
  onPrev,
  onSelect,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus tiap overlay muncul
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  const hasQuery = value.trim().length > 0;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 w-80">
      {/* Search bar */}
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex items-center gap-2 px-3 py-2">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Cari node..."
          className="flex-1 text-sm outline-none min-w-0"
        />
        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
          {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : "0/0"}
        </span>
        <button
          onClick={onPrev}
          disabled={matches.length === 0}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 shrink-0"
          title="Sebelumnya (Shift+Enter)"
        >
          <ChevronUp size={14} className="text-gray-600" />
        </button>
        <button
          onClick={onNext}
          disabled={matches.length === 0}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 shrink-0"
          title="Berikutnya (Enter)"
        >
          <ChevronDown size={14} className="text-gray-600" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 shrink-0"
          title="Tutup (Esc)"
        >
          <X size={14} className="text-gray-600" />
        </button>
      </div>

      {/* Dropdown list hasil pencarian */}
      {hasQuery && (
        <div className="mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              Tidak ada hasil
            </div>
          ) : (
            matches.map((m, i) => (
              <button
                key={m.id}
                onClick={() => onSelect(i)}
                className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-50 ${
                  i === currentIndex
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700"
                }`}
              >
                {m.label || "(tanpa label)"}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
