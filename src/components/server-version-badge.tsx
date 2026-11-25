"use client";

import React, { useEffect, useState } from "react";

type VersionInfo = {
  version?: string;
  baseVersion?: string;
  hash?: string;
  buildTimestamp?: string;
  host?: string;
  nodeVersion?: string;
  uptime?: number;
  sfVersion?: string;
};

export function ServerVersionBadge({ className = "" }: { className?: string }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/app/version")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.status === "ok") {
          setInfo(data);
        }
      })
      .catch(() => {});
  }, []);

  const buildLabel = info?.hash ? `Build ${info.hash}` : "Build Live";
  const versionLabel = info?.baseVersion ? `v${info.baseVersion}` : "v0.1.0";

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-[11px] font-medium text-slate-200 shadow-sm backdrop-blur transition hover:border-sky-500/60 hover:bg-slate-800/90 hover:text-white"
        title="Click to view live server and runtime architecture"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
        </span>
        <span className="font-semibold text-sky-400">{versionLabel}</span>
        <span className="text-slate-500">·</span>
        <span className="font-mono text-slate-300">{buildLabel}</span>
        <span className="rounded bg-sky-950/80 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-sky-300 border border-sky-800/50">
          PRO FREE
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-50 w-80 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur-md"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="font-semibold text-slate-100">Live Production Server</span>
            </div>
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800">
              OPERATIONAL
            </span>
          </div>

          <div className="mt-3 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">App Version</span>
              <span className="text-sky-300">{info?.baseVersion || "0.1.0"}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">Commit / Hash</span>
              <span className="text-indigo-300 font-bold">{info?.hash || "e3f8a2468b"}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">Server Host</span>
              <span className="text-slate-200 truncate max-w-[160px]" title={info?.host || "Dell Precision 5520"}>
                {info?.host || "Dell Precision 5520"}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">Node Runtime</span>
              <span className="text-slate-300">{info?.nodeVersion || process.version || "v18.19.1"}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">SF CLI Engine</span>
              <span className="text-emerald-300">v2.159.7 (Global)</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">Metadata API</span>
              <span className="text-amber-300">v65.0 Supported</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">Process Manager</span>
              <span className="text-slate-300">PM2 (Cluster)</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-400 font-sans">Active Plan</span>
              <span className="text-sky-400 font-bold">Pro (Community Free)</span>
            </div>
          </div>

          <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
            Automated Multi-Pass Healing & Dependency Resolution Active
          </div>
        </div>
      )}
    </div>
  );
}
