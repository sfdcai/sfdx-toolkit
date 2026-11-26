"use client";

import React, { useState, useEffect } from "react";

interface OneClickSyncPanelProps {
  activeProject: any;
  orgs: any[];
  onTriggerSync?: (options: { checkOnly?: boolean; autoSanitize?: boolean; alignUserData?: boolean }) => Promise<any>;
  onNavigateTab: (tab: any) => void;
}

export function OneClickSyncPanel({
  activeProject,
  orgs,
  onNavigateTab,
}: OneClickSyncPanelProps) {
  const [checkOnly, setCheckOnly] = useState(false);
  const [autoSanitize, setAutoSanitize] = useState(true);
  const [alignUserData, setAlignUserData] = useState(true);
  
  const [isRunning, setIsRunning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sourceOrg = activeProject?.sourceOrg;
  const destOrg = activeProject?.destinationOrg;

  const sourceOrgInfo = orgs.find((o) => o.alias === sourceOrg);
  const destOrgInfo = orgs.find((o) => o.alias === destOrg);

  const steps = [
    { id: "validating_health", label: "Health & Connection Check", desc: "Validates active OAuth sessions" },
    { id: "checking_dependencies", label: "Dynamic Package Scanner", desc: "Detects missing third-party namespaces" },
    { id: "sanitizing_metadata", label: "Metadata Sanitizer", desc: "Strips folderShares & normalizes dashboards" },
    { id: "simulating_dry_run", label: "Pre-Flight Dry Run", desc: "Simulates deployment with checkOnly: true" },
    { id: "deploying_live", label: "Live Atomic Deployment", desc: "Deploys verified components live to destination" },
    { id: "aligning_user_data", label: "User Data Alignment", desc: "Audits & syncs custom user routing data" },
  ];

  async function handleStartSync() {
    if (!activeProject?.id || !sourceOrg || !destOrg) {
      setError("Please configure both Source and Destination orgs in project settings.");
      return;
    }

    try {
      setError(null);
      setIsRunning(true);
      setLogs(["Initiating autonomous environment sync..."]);

      const res = await fetch(`/api/projects/${activeProject.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkOnly, autoSanitize, alignUserData }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start sync");

      setActiveJobId(data.jobId);
    } catch (err: any) {
      setError(err.message);
      setIsRunning(false);
    }
  }

  // Poll job status
  useEffect(() => {
    if (!activeJobId || !activeProject?.id) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${activeProject.id}/sync?jobId=${activeJobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setSyncStatus(data);

        if (data.message) {
          setLogs((prev) => {
            if (prev[prev.length - 1] === data.message) return prev;
            return [...prev, `[${new Date().toLocaleTimeString()}] ${data.message}`];
          });
        }

        if (data.status === "succeeded" || data.status === "failed") {
          setIsRunning(false);
          clearInterval(interval);
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId, activeProject?.id]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner / Hero Flow */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-8 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/60">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Source Org Card */}
          <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Source Environment
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              {sourceOrg || "Not Configured"}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              {sourceOrgInfo?.instanceUrl || "Select in Project Settings"}
            </div>
            {sourceOrgInfo?.username ? (
              <div className="mt-2 text-[11px] text-slate-400 truncate">
                User: {sourceOrgInfo.username}
              </div>
            ) : null}
          </div>

          {/* Sync Engine Arrow */}
          <div className="flex flex-col items-center justify-center gap-2 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
              <span className="text-xl">➔</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Autonomous Pipeline
            </span>
          </div>

          {/* Destination Org Card */}
          <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Destination Environment
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Target
              </span>
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              {destOrg || "Not Configured"}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              {destOrgInfo?.instanceUrl || "Select in Project Settings"}
            </div>
            {destOrgInfo?.username ? (
              <div className="mt-2 text-[11px] text-slate-400 truncate">
                User: {destOrgInfo.username}
              </div>
            ) : null}
          </div>
        </div>

        {/* Action Controls & Options */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-200/80 pt-6 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkOnly}
                onChange={(e) => setCheckOnly(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Simulation Only (checkOnly: true)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSanitize}
                onChange={(e) => setAutoSanitize(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Auto-Sanitize Metadata
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alignUserData}
                onChange={(e) => setAlignUserData(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Align User Routing Data
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStartSync}
              disabled={isRunning || !sourceOrg || !destOrg}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition-all ${
                isRunning
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-sky-500/25 active:scale-95"
              }`}
            >
              <span>{isRunning ? "⏳" : "🚀"}</span>
              <span>{isRunning ? "Syncing..." : checkOnly ? "Run Dry-Run Simulation" : "Start One-Click Sync"}</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        ) : null}
      </div>

      {/* Live Pipeline Telemetry */}
      {(isRunning || syncStatus) ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Pipeline Telemetry
              </div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                {syncStatus?.status === "succeeded"
                  ? "🎉 Synchronization Succeeded!"
                  : syncStatus?.status === "failed"
                  ? "❌ Synchronization Failed"
                  : `In Progress: ${syncStatus?.stage || "Initializing..."}`}
              </div>
            </div>
            {syncStatus?.percent ? (
              <span className="text-sm font-bold font-mono text-sky-600 dark:text-sky-400">
                {syncStatus.percent}%
              </span>
            ) : null}
          </div>

          {/* Progress Bar */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                syncStatus?.status === "failed"
                  ? "bg-rose-500"
                  : syncStatus?.status === "succeeded"
                  ? "bg-emerald-500"
                  : "bg-gradient-to-r from-sky-500 to-indigo-600"
              }`}
              style={{ width: `${syncStatus?.percent || (isRunning ? 15 : 0)}%` }}
            />
          </div>

          {/* Step Badges */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {steps.map((st, i) => {
              const currentStage = syncStatus?.stage;
              const isPast =
                syncStatus?.status === "succeeded" ||
                (syncStatus?.percent && syncStatus.percent > (i + 1) * 16);
              const isCurrent = currentStage === st.id && isRunning;

              return (
                <div
                  key={st.id}
                  className={`rounded-2xl border p-3 transition-all ${
                    isPast
                      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                      : isCurrent
                      ? "border-sky-300 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/40 ring-2 ring-sky-500/20"
                      : "border-slate-200/60 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/20 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">
                      {isPast ? "✅" : isCurrent ? "⏳" : "⚪"}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {st.desc}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Terminal / Console */}
          <div className="mt-6 rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Execution Logs
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="text-slate-300">
                  {log}
                </div>
              ))}
              {logs.length === 0 ? (
                <div className="text-slate-600">Waiting for logs...</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button
          onClick={() => onNavigateTab("parity")}
          className="group flex flex-col text-left rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-lg dark:bg-sky-950">
            🔍
          </div>
          <div className="mt-4 text-base font-bold text-slate-900 dark:text-white group-hover:text-sky-600">
            Environment Parity Matrix
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Audit Field-Level Security, active layouts, and user data across orgs.
          </div>
        </button>

        <button
          onClick={() => onNavigateTab("diff")}
          className="group flex flex-col text-left rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg dark:bg-indigo-950">
            🌲
          </div>
          <div className="mt-4 text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600">
            Git Comparison & Diffs
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Inspect line-by-line differences between QA and UAT with zero noise.
          </div>
        </button>

        <button
          onClick={() => onNavigateTab("history")}
          className="group flex flex-col text-left rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg dark:bg-emerald-950">
            📜
          </div>
          <div className="mt-4 text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-600">
            Deployments & Zip Snapshots
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            View past job runs, async deployment IDs, and download metadata archives.
          </div>
        </button>
      </div>
    </div>
  );
}
