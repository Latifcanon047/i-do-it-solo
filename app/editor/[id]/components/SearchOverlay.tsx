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
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onSelect: (index: number) => void;
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
    <div className="fixed top-16 left-4 z-30 w-72 bg-white rounded-lg shadow-lg border border-gray-200 flex flex-col max-h-[calc(100vh-6rem)]">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Cari node..."
          className="flex-1 text-sm outline-none min-w-0"
        />
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 shrink-0"
          title="Tutup (Esc)"
        >
          <X size={14} className="text-gray-600" />
        </button>
      </div>

      {/* Info jumlah hasil + navigasi — hanya muncul saat ada query aktif */}
      {hasQuery && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 shrink-0">
          <span className="text-xs text-gray-400 tabular-nums">
            {matches.length > 0
              ? `${currentIndex + 1}/${matches.length} hasil`
              : "Tidak ada hasil"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={matches.length === 0}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
              title="Sebelumnya (Shift+Enter)"
            >
              <ChevronUp size={14} className="text-gray-600" />
            </button>
            <button
              onClick={onNext}
              disabled={matches.length === 0}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
              title="Berikutnya (Enter)"
            >
              <ChevronDown size={14} className="text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* List node — selalu tampil, isinya semua node kalau query kosong */}
      {!hasQuery && (
        <div className="px-3 py-1.5 border-b border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">{matches.length} node</span>
        </div>
      )}

      {matches.length > 0 && (
        <div className="overflow-y-auto">
          {matches.map((m, i) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
