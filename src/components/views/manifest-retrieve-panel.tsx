"use client";

import React, { useState } from "react";

interface ManifestRetrievePanelProps {
  activeProject: any;
  sourceManifest: string;
  destManifest: string;
  onSourceManifestChange: (val: string) => void;
  onDestManifestChange: (val: string) => void;
  onGenerateManifest: (target: "source" | "destination") => Promise<void>;
  onSaveManifest: (target: "source" | "destination") => Promise<void>;
  onReloadManifests: () => Promise<void>;
  compareStrategy: string;
  onCompareStrategyChange: (strategy: any) => void;
  retrieveMode: "chunked" | "grouped";
  onRetrieveModeChange: (mode: "chunked" | "grouped") => void;
  retrieveRunning: string | null | false;
  onRetrieve: (target: "source" | "destination") => Promise<void>;
  onStopRetrieve: (target: "source" | "destination") => Promise<void>;
  retrieveEntries: any[];
}

export function ManifestRetrievePanel({
  activeProject,
  sourceManifest,
  destManifest,
  onSourceManifestChange,
  onDestManifestChange,
  onGenerateManifest,
  onSaveManifest,
  onReloadManifests,
  compareStrategy,
  onCompareStrategyChange,
  retrieveMode,
  onRetrieveModeChange,
  retrieveRunning,
  onRetrieve,
  onStopRetrieve,
  retrieveEntries,
}: ManifestRetrievePanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"manifest" | "retrieve">("manifest");
  const [generatingSource, setGeneratingSource] = useState(false);
  const [generatingDest, setGeneratingDest] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingDest, setSavingDest] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Subnav & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Manifest & Metadata Retrieval
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Define package.xml scope, generate manifests dynamically, and pull metadata in chunks or grouped batches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => setActiveSubTab("manifest")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeSubTab === "manifest"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              📦 Manifests
            </button>
            <button
              onClick={() => setActiveSubTab("retrieve")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeSubTab === "retrieve"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              📥 Retrieve Engine
            </button>
          </div>
          <button
            onClick={() => onReloadManifests()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ↻ Reload
          </button>
        </div>
      </div>

      {activeSubTab === "manifest" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Source Manifest Panel */}
          <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs text-emerald-800 font-bold dark:bg-emerald-950 dark:text-emerald-400">
                  S
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Source Manifest</h3>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {activeProject?.sourceOrg || "Unset"} (package.xml)
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={generatingSource}
                  onClick={async () => {
                    setGeneratingSource(true);
                    try {
                      await onGenerateManifest("source");
                    } finally {
                      setGeneratingSource(false);
                    }
                  }}
                  className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition disabled:opacity-50"
                >
                  {generatingSource ? "Generating..." : "⚡ Generate from Org"}
                </button>
                <button
                  disabled={savingSource}
                  onClick={async () => {
                    setSavingSource(true);
                    try {
                      await onSaveManifest("source");
                    } finally {
                      setSavingSource(false);
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {savingSource ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <textarea
              id="sourceManifest"
              className="mt-4 h-96 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              placeholder={`<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n  ...\n</Package>`}
              value={sourceManifest}
              onChange={(e) => onSourceManifestChange(e.target.value)}
            />
          </div>

          {/* Destination Manifest Panel */}
          <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-xs text-indigo-800 font-bold dark:bg-indigo-950 dark:text-indigo-400">
                  D
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Destination Manifest</h3>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {activeProject?.destinationOrg || "Unset"} (package.xml)
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={generatingDest}
                  onClick={async () => {
                    setGeneratingDest(true);
                    try {
                      await onGenerateManifest("destination");
                    } finally {
                      setGeneratingDest(false);
                    }
                  }}
                  className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {generatingDest ? "Generating..." : "⚡ Generate from Org"}
                </button>
                <button
                  disabled={savingDest}
                  onClick={async () => {
                    setSavingDest(true);
                    try {
                      await onSaveManifest("destination");
                    } finally {
                      setSavingDest(false);
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {savingDest ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <textarea
              id="destManifest"
              className="mt-4 h-96 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              placeholder={`<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n  ...\n</Package>`}
              value={destManifest}
              onChange={(e) => onDestManifestChange(e.target.value)}
            />
          </div>
        </div>
      ) : (
        /* Retrieve Sub Tab */
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Metadata Pull Execution Engine
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Execute segmented retrieves from target orgs into the local project file repository.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Mode:
                </span>
                <select
                  value={retrieveMode}
                  onChange={(e) => onRetrieveModeChange(e.target.value as any)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="chunked">Chunked (Isolated per Type)</option>
                  <option value="grouped">Grouped (Batch Manifests)</option>
                </select>
              </div>
            </div>

            {/* Retrieve Actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={Boolean(retrieveRunning)}
                onClick={() => onRetrieve("source")}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
              >
                <span>📥</span>
                <span>
                  {retrieveRunning === "source" ? "Retrieving Source Metadata..." : "Retrieve Source Metadata"}
                </span>
              </button>

              <button
                disabled={Boolean(retrieveRunning)}
                onClick={() => onRetrieve("destination")}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition disabled:opacity-50"
              >
                <span>📥</span>
                <span>
                  {retrieveRunning === "destination" ? "Retrieving Destination Metadata..." : "Retrieve Destination Metadata"}
                </span>
              </button>

              {retrieveRunning ? (
                <button
                  onClick={() => onStopRetrieve(retrieveRunning as any)}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                >
                  🛑 Stop Active Retrieve
                </button>
              ) : null}
            </div>

            {/* Status pills */}
            {retrieveEntries && retrieveEntries.length > 0 ? (
              <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Active Metadata Types ({retrieveEntries.length})
                </div>
                <div className="mt-3 flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {retrieveEntries.map((entry: any, i: number) => (
                    <span
                      key={i}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono font-medium ${
                        entry.status === "Succeeded"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                          : entry.status === "Running"
                          ? "bg-sky-50 text-sky-700 border border-sky-200 animate-pulse dark:bg-sky-950 dark:text-sky-300"
                          : "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      <span>{entry.type}</span>
                      <span className="text-[10px] opacity-75">({entry.count || 0})</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
