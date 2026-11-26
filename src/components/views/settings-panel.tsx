"use client";

import React, { useState } from "react";

interface SettingsPanelProps {
  activeProject: any;
  projects: any[];
  orgs: any[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onAttachOrgs: (sourceOrg: string, destOrg: string) => Promise<void>;
  onAddOrg: (alias: string, authUrl: string) => Promise<void>;
  onDeleteOrg: (alias: string) => Promise<void>;
  user?: any;
  theme: string;
  onThemeChange: (theme: any) => void;
}

export function SettingsPanel({
  activeProject,
  projects,
  orgs,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onAttachOrgs,
  onAddOrg,
  onDeleteOrg,
  user,
  theme,
  onThemeChange,
}: SettingsPanelProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [newOrgAlias, setNewOrgAlias] = useState("");
  const [newOrgAuthUrl, setNewOrgAuthUrl] = useState("");
  const [selectedSource, setSelectedSource] = useState(activeProject?.sourceOrg || "");
  const [selectedDest, setSelectedDest] = useState(activeProject?.destinationOrg || "");
  const [savingBinding, setSavingBinding] = useState(false);
  const [creatingProj, setCreatingProj] = useState(false);
  const [addingOrg, setAddingOrg] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Workspace Settings & Environments
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure active projects, bind Salesforce orgs, manage OAuth connections, and adjust platform preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project Setup Card */}
        <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-100 text-sky-800 font-bold dark:bg-sky-950 dark:text-sky-400">
              📁
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Project Workspaces</h3>
              <p className="text-[11px] text-slate-500">Isolated workspace folders with dedicated manifests & diffs.</p>
            </div>
          </div>

          {/* Project List */}
          <div className="mt-4 flex flex-col gap-2 max-h-56 overflow-y-auto">
            {projects.map((proj) => {
              const isActive = proj.id === activeProject?.id;
              return (
                <div
                  key={proj.id}
                  className={`flex items-center justify-between rounded-xl border p-3 transition ${
                    isActive
                      ? "border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/40"
                      : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{proj.name}</span>
                      {isActive ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {proj.sourceOrg || "Unset"} ➔ {proj.destinationOrg || "Unset"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isActive ? (
                      <button
                        onClick={() => onSelectProject(proj.id)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                      >
                        Select
                      </button>
                    ) : null}
                    <button
                      onClick={() => onDeleteProject(proj.id)}
                      className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1"
                      title="Delete Project"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Create New Project */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <input
              id="projectName"
              type="text"
              placeholder="New Project Name (e.g. MBFS-Sprint-2)"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button
              disabled={!newProjectName.trim() || creatingProj}
              onClick={async () => {
                setCreatingProj(true);
                try {
                  await onCreateProject(newProjectName.trim());
                  setNewProjectName("");
                } finally {
                  setCreatingProj(false);
                }
              }}
              className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition disabled:opacity-50"
            >
              {creatingProj ? "Creating..." : "Create"}
            </button>
          </div>
        </div>

        {/* Org Binding Card */}
        <div className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800 font-bold dark:bg-indigo-950 dark:text-indigo-400">
              🔗
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Project Org Binding</h3>
              <p className="text-[11px] text-slate-500">Attach Source and Destination orgs to &apos;{activeProject?.name}&apos;.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Source Org (Origin)</label>
              <select
                id="sourceOrgSelect"
                value={selectedSource || activeProject?.sourceOrg || ""}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">-- Select Source Org --</option>
                {orgs.map((o) => (
                  <option key={o.alias} value={o.alias}>
                    {o.alias} ({o.instanceUrl || "Connected"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Destination Org (Target)</label>
              <select
                id="destOrgSelect"
                value={selectedDest || activeProject?.destinationOrg || ""}
                onChange={(e) => setSelectedDest(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">-- Select Destination Org --</option>
                {orgs.map((o) => (
                  <option key={o.alias} value={o.alias}>
                    {o.alias} ({o.instanceUrl || "Connected"})
                  </option>
                ))}
              </select>
            </div>

            <button
              disabled={savingBinding}
              onClick={async () => {
                setSavingBinding(true);
                try {
                  await onAttachOrgs(selectedSource || activeProject?.sourceOrg, selectedDest || activeProject?.destinationOrg);
                } finally {
                  setSavingBinding(false);
                }
              }}
              className="mt-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition disabled:opacity-50"
            >
              {savingBinding ? "Saving Binding..." : "Save Org Binding"}
            </button>
          </div>
        </div>
      </div>

      {/* Orgs Management Card */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold dark:bg-emerald-950 dark:text-emerald-400">
              ☁️
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Connected Salesforce Orgs</h3>
              <p className="text-[11px] text-slate-500">Authorized sandbox & production org connections.</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {orgs.length} Orgs Authorized
          </span>
        </div>

        {/* Org List */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <div
              key={org.alias}
              className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">{org.alias}</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{org.instanceUrl || "Authorized"}</div>
              </div>
              <button
                onClick={() => onDeleteOrg(org.alias)}
                className="text-xs text-slate-400 hover:text-rose-600 p-1"
                title="Remove Org"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add Org Form */}
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Authorize New Org via sfdxAuthUrl
          </h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input
              id="orgAlias"
              type="text"
              placeholder="Org Alias (e.g. QA, UAT, PROD)"
              value={newOrgAlias}
              onChange={(e) => setNewOrgAlias(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <div className="sm:col-span-2 flex gap-2">
              <input
                id="orgAuthUrl"
                type="password"
                placeholder="force://PlatformCLI::..."
                value={newOrgAuthUrl}
                onChange={(e) => setNewOrgAuthUrl(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <button
                disabled={!newOrgAlias.trim() || !newOrgAuthUrl.trim() || addingOrg}
                onClick={async () => {
                  setAddingOrg(true);
                  try {
                    await onAddOrg(newOrgAlias.trim(), newOrgAuthUrl.trim());
                    setNewOrgAlias("");
                    setNewOrgAuthUrl("");
                  } finally {
                    setAddingOrg(false);
                  }
                }}
                className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {addingOrg ? "Authorizing..." : "Add Org"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
