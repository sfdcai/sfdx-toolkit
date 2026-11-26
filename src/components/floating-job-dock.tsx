"use client";

import React, { useState } from "react";

interface FloatingJobDockProps {
  currentProcess?: string;
  deployJobId?: string;
  compareJobId?: string;
  deployStatus?: any;
  compareStatus?: any;
  onOpenSection: (section: string) => void;
  onCancelJob?: () => void;
  lastDeployStatus?: string;
  activeProjectName?: string;
  sourceOrg?: string;
  destOrg?: string;
}

export function FloatingJobDock({
  currentProcess,
  deployJobId,
  compareJobId,
  deployStatus,
  compareStatus,
  onOpenSection,
  onCancelJob,
  lastDeployStatus,
  activeProjectName,
  sourceOrg,
  destOrg,
}: FloatingJobDockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const isRunning = Boolean(currentProcess || deployJobId || compareJobId);

  // Status message
  const statusMessage = currentProcess
    ? `Running: ${currentProcess}`
    : deployStatus?.status === "InProgress"
    ? `Deploying to ${destOrg || "Target"}...`
    : compareStatus?.status === "running"
    ? "Comparing Orgs..."
    : lastDeployStatus
    ? `Last Deploy: ${lastDeployStatus}`
    : "System Ready";

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-6 z-40 flex items-center gap-2 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xl backdrop-blur-md hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800 transition-all"
      >
        <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
        <span>Dock</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-6 z-40 max-w-xl transition-all">
      <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 overflow-hidden">
        {/* Main Dock Bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          {/* Status Indicator & Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`flex h-2.5 w-2.5 rounded-full shrink-0 ${
                isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {statusMessage}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                {activeProjectName ? `${activeProjectName} · ` : ""}
                {sourceOrg && destOrg ? `${sourceOrg} ➔ ${destOrg}` : "No Orgs Bound"}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                >
                  {isExpanded ? "Hide Logs" : "Logs"}
                </button>
                {onCancelJob ? (
                  <button
                    onClick={onCancelJob}
                    className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300"
                  >
                    Cancel
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  onClick={() => onOpenSection("syncSection")}
                  className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-500 shadow-sm transition"
                >
                  ⚡ Sync
                </button>
                <button
                  onClick={() => onOpenSection("jobSection")}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Jobs
                </button>
              </>
            )}

            {/* Minimize button */}
            <button
              onClick={() => setIsMinimized(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              title="Minimize Dock"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Live Logs Drawer (Expandable) */}
        {isExpanded && isRunning ? (
          <div className="border-t border-slate-100 bg-slate-950 p-3 text-[11px] font-mono text-emerald-400 max-h-48 overflow-y-auto leading-relaxed dark:border-slate-800">
            <div>&gt; [Job Telemetry Active]</div>
            {deployJobId ? <div>&gt; Deploy Job ID: {deployJobId}</div> : null}
            {compareJobId ? <div>&gt; Compare Job ID: {compareJobId}</div> : null}
            <div>&gt; Current Stage: {currentProcess || "Processing..."}</div>
            <div className="text-slate-400 mt-2 text-[10px]">
              Click &apos;Jobs&apos; in navigation to view full CLI standard out.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
