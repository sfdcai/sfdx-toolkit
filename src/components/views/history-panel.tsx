"use client";

import React from "react";

interface HistoryPanelProps {
  activeProject: any;
  onNavigateTab: (tab: any) => void;
}

export function HistoryPanel({ activeProject }: HistoryPanelProps) {
  const downloadLink = "https://commissionsmbfs--uat.sandbox.my.salesforce.com/sfc/servlet.shepherd/document/download/069S900000TKTrbIAH";
  const lightningLink = "https://commissionsmbfs--uat.sandbox.my.salesforce.com/lightning/r/ContentDocument/069S900000TKTrbIAH/view";

  const pastPhases = [
    { phase: "Phase 7K", name: "User Schema, Dashboards & Email Templates", asyncId: "0AfS900000UEyxVKAT", status: "Succeeded", date: "Nov 26, 2026" },
    { phase: "Phase 7J", name: "Full Profile FLS Parity (141 Case Fields)", asyncId: "0AfS900000UEvGTKA1", status: "Succeeded", date: "Nov 26, 2026" },
    { phase: "Phase 7I", name: "LWC Apex Class Access Suite (29 Controllers)", asyncId: "0AfS900000UESSzKAP", status: "Succeeded", date: "Nov 25, 2026" },
    { phase: "Phase 7H", name: "Profile Layout Assignments & App Overrides", asyncId: "0AfS900000UER0gKAH", status: "Succeeded", date: "Nov 25, 2026" },
    { phase: "Phase 7G", name: "Tab Permissions & App Visibility", asyncId: "0AfS900000UERS5KAP", status: "Succeeded", date: "Nov 25, 2026" },
    { phase: "Phase 7F", name: "Operational Navigation Suite & Service Console", asyncId: "0AfS900000UEQxTKAX", status: "Succeeded", date: "Nov 25, 2026" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Download Card */}
      <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-sky-50 to-indigo-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/60">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold text-xl shadow-md">
              📦
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                Live Metadata Package Archive (`metadata.zip`)
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Uploaded to Salesforce Files in UAT · ContentDocument `069S900000TKTrbIAH` · 26.32 MB
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={downloadLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-500/20 hover:bg-sky-500 transition"
            >
              <span>⬇️</span>
              <span>Download ZIP</span>
            </a>
            <a
              href={lightningLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <span>Salesforce Files</span>
            </a>
          </div>
        </div>
      </div>

      {/* Deployment History Table */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Deployment Audit Ledger
        </div>
        <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
          Recent Parity Deployments to UAT
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 dark:border-slate-800">
                <th className="pb-3 font-semibold">Phase</th>
                <th className="pb-3 font-semibold">Scope & Description</th>
                <th className="pb-3 font-semibold">Async Deployment ID</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {pastPhases.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 font-bold text-slate-900 dark:text-white">{p.phase}</td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{p.name}</td>
                  <td className="py-3 font-mono text-slate-500">{p.asyncId}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 text-slate-400">{p.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
