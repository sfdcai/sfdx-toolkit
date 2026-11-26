"use client";

import React, { useState } from "react";

interface GitDiffPanelProps {
  activeProject: any;
  onNavigateTab: (tab: any) => void;
}

export function GitDiffPanel({ activeProject, onNavigateTab }: GitDiffPanelProps) {
  const [selectedDomain, setSelectedDomain] = useState<string>("all");

  const domains = [
    { id: "all", label: "All Changes" },
    { id: "classes", label: "Apex Classes", count: 4 },
    { id: "triggers", label: "Apex Triggers", count: 0, tag: "100% Match" },
    { id: "lwc", label: "LWC Components", count: 2 },
    { id: "flows", label: "Flows", count: 5 },
    { id: "dashboards", label: "Dashboards", count: 5 },
  ];

  const sampleChanges = [
    {
      file: "classes/CaseAssignmentHandler.cls",
      type: "Modified",
      domain: "classes",
      desc: "Sticky agent routing logic added in QA to retain original level assignee.",
    },
    {
      file: "classes/CaseAssignController.cls",
      type: "Modified",
      domain: "classes",
      desc: "Added Level-2 return flow to Level-1 when previous assigner exists.",
    },
    {
      file: "lwc/assignCase/assignCase.js",
      type: "Modified",
      domain: "lwc",
      desc: "Helptext getter commented out in QA.",
    },
    {
      file: "lwc/sectionRedressLetter/sectionRedressLetter.js",
      type: "Modified",
      domain: "lwc",
      desc: "Letter preview default visibility flag expanded in QA.",
    },
    {
      file: "flows/Flow_Opt_In_Mail_sending.flow-meta.xml",
      type: "Status Difference",
      domain: "flows",
      desc: "Obsolete in QA, Draft in UAT.",
    },
  ];

  const filtered =
    selectedDomain === "all"
      ? sampleChanges
      : sampleChanges.filter((c) => c.domain === selectedDomain);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Cross-Org Git Intelligence
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              QA ⇄ UAT Git Comparison
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              High-precision delta detection between live sandbox branches without noise.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Branch: qa..uat
            </span>
          </div>
        </div>

        {/* Domain Filter Pills */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-4 dark:border-slate-800">
          {domains.map((dom) => (
            <button
              key={dom.id}
              onClick={() => setSelectedDomain(dom.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${
                selectedDomain === dom.id
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <span>{dom.label}</span>
              {dom.count !== undefined ? (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    dom.count === 0
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-white/20 text-white"
                  }`}
                >
                  {dom.tag || dom.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Change List */}
        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filtered.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-3.5 gap-2"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      item.type === "Modified"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400"
                        : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-400"
                    }`}
                  >
                    {item.type}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {item.file}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {item.desc}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigateTab("sync")}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Sync to Target
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
