"use client";

import React, { useMemo, useState, useEffect } from "react";

export type OrchestratorFlowProps = {
  activeProject: any;
  projects: any[];
  orgs: any[];
  hasSourceRetrieve: boolean;
  hasDestinationRetrieve: boolean;
  diffCount: number;
  selectedDiffCount: number;
  manifestReady: boolean;
  deltaManifest: string;
  deployStatus: any;
  deployJobId: string;
  currentProcess: string;
  onNavigateSection: (sectionId: string) => void;
  onRetrieve: (target: "source" | "destination") => void;
  onCompare: (strategy?: "auto" | "delta" | "existing" | "custom" | "merge" | "scope") => void;
  onBuildDelta: () => void;
  onDeploy: (options: { checkOnly?: boolean; autoRetry?: boolean }) => void;
  viewMode: "simple" | "advanced";
  onChangeViewMode: (mode: "simple" | "advanced") => void;
  onSelectProject?: (projectId: string) => void;
};

export function OrchestratorFlow({
  activeProject,
  projects,
  orgs,
  hasSourceRetrieve,
  hasDestinationRetrieve,
  diffCount,
  selectedDiffCount,
  manifestReady,
  deltaManifest,
  deployStatus,
  deployJobId,
  currentProcess,
  onNavigateSection,
  onRetrieve,
  onCompare,
  onBuildDelta,
  onDeploy,
  viewMode,
  onChangeViewMode,
  onSelectProject
}: OrchestratorFlowProps) {
  // Determine the highest available/recommended stage based on workspace telemetry
  const autoStage = useMemo(() => {
    if (!activeProject?.id || !activeProject?.sourceOrg || !activeProject?.destinationOrg) {
      return 1; // Connect & Bind Orgs
    }
    if (!hasSourceRetrieve || !hasDestinationRetrieve) {
      return 2; // Retrieve Metadata
    }
    if (!deltaManifest || (!diffCount && !selectedDiffCount)) {
      return 3; // Compare & Stage Delta
    }
    if (deployStatus?.phase === "validated" || deployStatus?.summary?.toLowerCase().includes("validation passed")) {
      return 5; // Ready to Deploy!
    }
    return 4; // Pre-Flight Validation
  }, [activeProject, hasSourceRetrieve, hasDestinationRetrieve, deltaManifest, diffCount, selectedDiffCount, deployStatus]);

  // User-controllable active step, defaults to autoStage
  const [activeStep, setActiveStep] = useState<number>(autoStage);

  // Sync active step when autoStage changes, unless user manually navigated
  useEffect(() => {
    setActiveStep(autoStage);
  }, [autoStage]);

  const isDeployRunning = Boolean(
    deployJobId ||
      currentProcess.includes("deploy") ||
      deployStatus?.status === "running"
  );

  const stages = [
    {
      num: 1,
      id: "orgs",
      title: "Connect Orgs",
      badge: "Stage 1",
      desc: "Source & Target",
      isComplete: Boolean(activeProject?.id && activeProject?.sourceOrg && activeProject?.destinationOrg),
      section: "projectSection"
    },
    {
      num: 2,
      id: "retrieve",
      title: "Retrieve Metadata",
      badge: "Stage 2",
      desc: "Source & Target Chunks",
      isComplete: hasSourceRetrieve && hasDestinationRetrieve,
      section: "retrieveSection"
    },
    {
      num: 3,
      id: "diff",
      title: "Compare & Delta",
      badge: "Stage 3",
      desc: "Differential Staging",
      isComplete: Boolean(deltaManifest && (selectedDiffCount > 0 || diffCount > 0)),
      section: "diffSection"
    },
    {
      num: 4,
      id: "validate",
      title: "Pre-Flight Validation",
      badge: "Stage 4",
      desc: "Target Org Dry-Run",
      isComplete: deployStatus?.phase === "validated" || deployStatus?.summary?.toLowerCase().includes("validation passed"),
      section: "deploySection"
    },
    {
      num: 5,
      id: "deploy",
      title: "Deploy & Auto-Heal",
      badge: "Stage 5",
      desc: "Multi-Pass Release",
      isComplete: deployStatus?.status === "done" && !deployStatus?.checkOnly,
      section: "deploySection"
    }
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/95 via-slate-900/80 to-slate-950/95 p-6 shadow-2xl backdrop-blur-xl">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl"></div>
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl"></div>

      {/* Top Bar with Title and Simple/Advanced Switcher */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-600 text-sm font-bold text-slate-950 shadow-md shadow-sky-500/30">
              ⚡
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              DevOps Orchestrator
            </h2>
            <span className="rounded-full border border-sky-400/40 bg-sky-950/80 px-2.5 py-0.5 text-[11px] font-bold text-sky-300">
              STEP {activeStep} OF 5
            </span>
            {isDeployRunning && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                OPERATION ACTIVE
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Guided end-to-end pipeline directing your Salesforce metadata changes from sandbox discovery to production release.
          </p>
        </div>

        {/* Simple vs Advanced Mode Toggle */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-800 bg-slate-950/90 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => onChangeViewMode("simple")}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              viewMode === "simple"
                ? "bg-sky-400 text-slate-950 font-bold shadow-md shadow-sky-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🎯</span> Simple Pipeline
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("advanced")}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              viewMode === "advanced"
                ? "bg-slate-800 text-sky-400 border border-sky-500/50 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🛠️</span> Advanced Tools
          </button>
        </div>
      </div>

      {/* 5-Stage Stepper Header */}
      <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stages.map((stage) => {
          const isCurrent = activeStep === stage.num;
          const isDone = stage.isComplete;

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setActiveStep(stage.num)}
              className={`group relative flex flex-col rounded-2xl border p-3.5 text-left transition-all ${
                isCurrent
                  ? "border-sky-400/80 bg-slate-800/90 shadow-lg shadow-sky-500/15 ring-2 ring-sky-400/40"
                  : isDone
                  ? "border-emerald-500/40 bg-emerald-950/30 hover:border-emerald-500/60"
                  : "border-slate-800/80 bg-slate-950/50 opacity-75 hover:border-slate-700 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? "bg-emerald-400 text-slate-950 font-extrabold"
                      : isCurrent
                      ? "bg-sky-400 text-slate-950 font-extrabold ring-4 ring-sky-400/30"
                      : "bg-slate-800 text-slate-400 font-medium"
                  }`}
                >
                  {isDone ? "✓" : stage.num}
                </span>

                <span
                  className={`text-[9px] font-extrabold uppercase tracking-wider ${
                    isDone
                      ? "text-emerald-300"
                      : isCurrent
                      ? "text-sky-300"
                      : "text-slate-500"
                  }`}
                >
                  {isDone ? "DONE" : isCurrent ? "ACTIVE" : "NEXT"}
                </span>
              </div>

              <div className="mt-2.5">
                <div className={`text-xs font-bold truncate ${isCurrent ? "text-white" : isDone ? "text-emerald-100" : "text-slate-300"}`}>
                  {stage.title}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {stage.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Embedded In-Flow Interactive Stage Workstation */}
      <div className="relative z-10 mt-6 rounded-2xl border border-slate-800/90 bg-slate-950/80 p-5 shadow-xl">
        {/* Stage 1: Connect Orgs */}
        {activeStep === 1 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Step 1 of 5</span>
                <h3 className="text-base font-bold text-white">Select Project & Connect Salesforce Orgs</h3>
                <p className="text-xs text-slate-400">
                  Bind your development workspace to a Source Org (Sandbox) and Destination Org (UAT/Production).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  stages[0].isComplete ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-amber-950/80 text-amber-300 border border-amber-800"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${stages[0].isComplete ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                  {stages[0].isComplete ? "Environment Bound" : "Configuration Needed"}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 pt-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                <label className="text-[11px] font-semibold text-slate-300">Active Project Workspace</label>
                <div className="mt-2 text-sm font-bold text-sky-300 truncate">
                  📁 {activeProject?.name || "No Project Selected"}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {projects.length} available projects in tenant
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                <label className="text-[11px] font-semibold text-slate-300">Source Org (Sandbox / Feature)</label>
                <div className="mt-2 text-sm font-bold text-slate-200">
                  {activeProject?.sourceOrg ? `🟢 ${activeProject.sourceOrg}` : "⚠️ Unset"}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Where changes originate from</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                <label className="text-[11px] font-semibold text-slate-300">Destination Org (Target / Release)</label>
                <div className="mt-2 text-sm font-bold text-slate-200">
                  {activeProject?.destinationOrg ? `🔵 ${activeProject.destinationOrg}` : "⚠️ Unset"}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Target for validation and deployment</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
              <button
                type="button"
                onClick={() => onNavigateSection("projectSection")}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition"
              >
                Manage Projects & Orgs Full Setup →
              </button>

              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/20 hover:bg-sky-300 transition active:scale-[0.98]"
              >
                Next Step: Retrieve Metadata →
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Retrieve Metadata */}
        {activeStep === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Step 2 of 5</span>
                <h3 className="text-base font-bold text-white">Retrieve Metadata from Connected Orgs</h3>
                <p className="text-xs text-slate-400">
                  Fetch metadata components into isolated workspaces to enable fine-grained differential comparison.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  stages[1].isComplete ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-amber-950/80 text-amber-300 border border-amber-800"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${stages[1].isComplete ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                  {stages[1].isComplete ? "Both Workspaces Synced" : "Retrieval Pending"}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 pt-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-200">Source Org Workspace</div>
                  <span className={`text-[10px] font-bold uppercase ${hasSourceRetrieve ? "text-emerald-400" : "text-amber-400"}`}>
                    {hasSourceRetrieve ? "✔ Synced" : "Pending"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400 font-mono">Org: {activeProject?.sourceOrg || "unset"}</div>
                <button
                  type="button"
                  onClick={() => onRetrieve("source")}
                  className="mt-3 w-full rounded-xl border border-sky-500/40 bg-sky-500/10 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/20 transition"
                >
                  Retrieve Source Metadata
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-200">Destination Org Workspace</div>
                  <span className={`text-[10px] font-bold uppercase ${hasDestinationRetrieve ? "text-emerald-400" : "text-amber-400"}`}>
                    {hasDestinationRetrieve ? "✔ Synced" : "Pending"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400 font-mono">Org: {activeProject?.destinationOrg || "unset"}</div>
                <button
                  type="button"
                  onClick={() => onRetrieve("destination")}
                  className="mt-3 w-full rounded-xl border border-indigo-500/40 bg-indigo-500/10 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition"
                >
                  Retrieve Destination Metadata
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                ← Back to Orgs
              </button>

              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/20 hover:bg-sky-300 transition active:scale-[0.98]"
              >
                Next Step: Compare & Delta →
              </button>
            </div>
          </div>
        )}

        {/* Stage 3: Compare & Delta */}
        {activeStep === 3 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Step 3 of 5</span>
                <h3 className="text-base font-bold text-white">Compare Metadata & Build Staged Delta</h3>
                <p className="text-xs text-slate-400">
                  Analyze differences between environments, select modified components, and stage the deployment package.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  stages[2].isComplete ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-amber-950/80 text-amber-300 border border-amber-800"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${stages[2].isComplete ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                  {stages[2].isComplete ? "Delta Package Ready" : "Comparison Needed"}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 pt-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">Detected Changes</div>
                <div className="mt-1 text-2xl font-bold text-white">{diffCount}</div>
                <div className="mt-1 text-[11px] text-slate-400">Differences between orgs</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">Selected for Release</div>
                <div className="mt-1 text-2xl font-bold text-sky-300">{selectedDiffCount}</div>
                <div className="mt-1 text-[11px] text-slate-400">Components to be packaged</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                <div className="text-[11px] font-semibold text-slate-400">Delta Package Status</div>
                <div className="mt-1 text-sm font-bold text-emerald-400">
                  {deltaManifest ? "✔ delta-package.xml Generated" : "Waiting for staging"}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Isolated in deploy/ workspace</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  ← Back to Retrieve
                </button>
                <button
                  type="button"
                  onClick={() => onCompare("auto")}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/20 transition"
                >
                  Run Comparison Job
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onBuildDelta}
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 transition active:scale-[0.98]"
                >
                  Stage Selected Delta
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/20 hover:bg-sky-300 transition active:scale-[0.98]"
                >
                  Next Step: Validate →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage 4: Pre-Flight Validation */}
        {activeStep === 4 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Step 4 of 5</span>
                <h3 className="text-base font-bold text-white">Pre-Flight Dry-Run Validation</h3>
                <p className="text-xs text-slate-400">
                  Run a non-destructive dry run (`--check-only`) against {activeProject?.destinationOrg || "the target org"} to catch Apex compilation, permission, or dependency issues.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  stages[3].isComplete ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-sky-950/80 text-sky-300 border border-sky-800"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${stages[3].isComplete ? "bg-emerald-400" : "bg-sky-400"}`}></span>
                  {stages[3].isComplete ? "Validation Passed (0 Errors)" : "Ready for Dry Run"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between text-xs">
                <div className="font-semibold text-slate-200">Validation Safety Invariants Active:</div>
                <span className="font-mono text-emerald-400">--dry-run enabled</span>
              </div>
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> Zero changes persisted to destination org during validation.
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> Compiles all dependent Apex classes, triggers, and test suites.
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> Validates CustomField, Profile, and Flow referential integrity.
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                ← Back to Delta
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isDeployRunning}
                  onClick={() => onDeploy({ checkOnly: true, autoRetry: true })}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-indigo-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 hover:from-amber-300 hover:to-indigo-400 transition active:scale-[0.98] disabled:opacity-50"
                >
                  <span>🛡️</span> Execute Pre-Flight Dry Run
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(5)}
                  className="flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-sky-500/20 hover:bg-sky-300 transition active:scale-[0.98]"
                >
                  Next Step: Deploy →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage 5: Deploy & Auto-Heal */}
        {activeStep === 5 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Step 5 of 5</span>
                <h3 className="text-base font-bold text-white">Production Release & Multi-Pass Auto-Healing</h3>
                <p className="text-xs text-slate-400">
                  Deploy the verified delta package to {activeProject?.destinationOrg || "Target Org"}. Layered deployment and AI healing are active.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  stages[4].isComplete ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800" : "bg-sky-950/80 text-sky-300 border border-sky-800"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${stages[4].isComplete ? "bg-emerald-400" : "bg-sky-400"}`}></span>
                  {stages[4].isComplete ? "Deployment Succeeded" : "Ready for Release"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Release Target</div>
                <div className="mt-1 text-sm font-bold text-sky-300 truncate">
                  🎯 {activeProject?.destinationOrg || "Unset"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Multi-Pass Engine</div>
                <div className="mt-1 text-sm font-bold text-emerald-400">
                  ⚡ 4 Layers (Infra → Access)
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Autonomous AI Agent</div>
                <div className="mt-1 text-sm font-bold text-indigo-400">
                  🤖 Auto-Healing Enabled
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                ← Back to Validation
              </button>

              <button
                type="button"
                disabled={isDeployRunning}
                onClick={() => onDeploy({ checkOnly: false, autoRetry: true })}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 px-6 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg shadow-emerald-500/25 hover:from-emerald-300 hover:to-sky-300 transition active:scale-[0.98] disabled:opacity-50"
              >
                <span>🚀</span> Deploy Delta to {activeProject?.destinationOrg || "Production"}
              </button>
            </div>
          </div>
        )}

        {/* Live Progress Bar for Long-Running Deployments / Validations */}
        {isDeployRunning && (
          <div className="mt-4 border-t border-slate-800/90 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-bold text-sky-400">
                <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping"></span>
                {deployStatus?.summary || "Long-running metadata operation in progress..."}
              </span>
              <span className="font-mono text-slate-300">
                Phase: <span className="text-white font-extrabold uppercase">{deployStatus?.phase || "running"}</span> · {deployStatus?.progressPercent || 50}%
              </span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400 transition-all duration-500 ease-out"
                style={{ width: `${deployStatus?.progressPercent || 50}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
