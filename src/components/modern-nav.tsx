"use client";

import React from "react";

export type NavTab = "sync" | "parity" | "diff" | "manifest" | "history" | "settings";

interface ModernNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  activeProject: any;
  projects: any[];
  onSelectProject: (projectId: string) => void;
  sourceOrg?: string;
  destOrg?: string;
  isSyncing?: boolean;
  theme: string;
  onThemeChange: (theme: any) => void;
  user?: any;
  onLogout: () => void;
}

export function ModernNav({
  activeTab,
  onTabChange,
  activeProject,
  projects,
  onSelectProject,
  sourceOrg,
  destOrg,
  isSyncing,
  theme,
  onThemeChange,
  user,
  onLogout,
}: ModernNavProps) {
  const tabs: { id: NavTab; label: string; icon: string; badge?: string }[] = [
    { id: "sync", label: "One-Click Sync", icon: "⚡", badge: isSyncing ? "Running" : undefined },
    { id: "parity", label: "Environment Parity", icon: "🔍" },
    { id: "diff", label: "Git Diff & Delta", icon: "🌲" },
    { id: "manifest", label: "Manifest & Retrieve", icon: "📦" },
    { id: "history", label: "History & Logs", icon: "📜" },
    { id: "settings", label: "Projects & Orgs", icon: "⚙️" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Left: Brand & Project Switcher */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold shadow-md shadow-sky-500/20">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  SFDX Platform
                </span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  v0.2.0
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Enterprise DevOps & Parity
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

          {/* Project Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Project:</span>
            <select
              value={activeProject?.id || ""}
              onChange={(e) => onSelectProject(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Org Connection Chips */}
          {sourceOrg || destOrg ? (
            <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs dark:border-slate-800 dark:bg-slate-800/60">
              <span className="flex items-center gap-1 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {sourceOrg || "Unset"}
              </span>
              <span className="text-slate-400">➔</span>
              <span className="flex items-center gap-1 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                {destOrg || "Unset"}
              </span>
            </div>
          ) : null}
        </div>

        {/* Center/Right: Navigation Tabs */}
        <nav className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge ? (
                  <span className="animate-pulse rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Right: Theme Toggle & User */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Toggle Theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {user.email ? user.email.slice(0, 2).toUpperCase() : "U"}
              </div>
              <button
                onClick={onLogout}
                className="text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
              >
                Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
