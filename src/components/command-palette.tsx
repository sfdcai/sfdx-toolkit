"use client";

import React, { useState, useEffect, useRef } from "react";

export type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navigation" | "Actions" | "Tools";
  icon: string;
  badge?: string;
  shortcut?: string;
  run: () => void;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

export function CommandPalette({ isOpen, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = actions.filter((act) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      act.title.toLowerCase().includes(q) ||
      (act.subtitle && act.subtitle.toLowerCase().includes(q)) ||
      act.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside palette
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].run();
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <span className="text-slate-400 text-base">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search workspace... (Esc to exit)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder-slate-500"
          />
          <kbd className="hidden sm:inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-100/60 dark:divide-slate-800/40">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching commands or tools found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition ${
                    isSelected
                      ? "bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-100"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800">
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{item.title}</div>
                      {item.subtitle ? (
                        <div className="text-[10px] text-slate-400 truncate">{item.subtitle}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {item.badge}
                      </span>
                    ) : null}
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.category}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
          <span>Navigate with <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd></span>
          <span>Select with <kbd className="font-mono">↵ Enter</kbd></span>
        </div>
      </div>
    </div>
  );
}
