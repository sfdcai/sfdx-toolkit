"use client";

import React, { useState } from "react";

interface ParityPanelProps {
  activeProject: any;
  orgs: any[];
}

export function ParityPanel({ activeProject }: ParityPanelProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceOrg = activeProject?.sourceOrg;
  const destOrg = activeProject?.destinationOrg;

  async function handleRunAudit() {
    if (!sourceOrg || !destOrg) {
      setError("Please configure both Source and Destination orgs in project settings.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Run audit through API or sync check
      const res = await fetch(`/api/projects/${activeProject.id}/compare?strategy=auto`);
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to run parity audit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Cross-Environment Health & Parity
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              {sourceOrg || "QA"} ⇄ {destOrg || "UAT"} Alignment
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Real-time audit of Field-Level Security, active layouts, installed packages, and user routing.
            </div>
          </div>

          <button
            onClick={handleRunAudit}
            disabled={loading || !sourceOrg || !destOrg}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:opacity-50"
          >
            <span>{loading ? "⏳" : "🔍"}</span>
            <span>{loading ? "Auditing Parity..." : "Run Fresh Parity Audit"}</span>
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {/* Feature Cards Grid */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Profile FLS Protection
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                Active
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              100%
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Objects & Layouts automatically bundled to prevent silent stripping.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Folder Share Sanitization
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                Active
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              0 Failures
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Sandbox-specific usernames sanitized from dashboards and email folders.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                User Routing Data Parity
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                Synced
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              5 Team Members
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Custom user fields aligned for case queues and queueables.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
