"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useMemo, useState } from "react";

type Usage = { users: number; projects: number; orgs: number; storageBytes: number; retrieves: number; deploys: number };
type Limits = { maxUsers: number; maxProjects: number; maxOrgs: number; maxStorageBytes: number; maxRetrieves: number; maxDeploys: number };
type UserRow = { id: string; tenantId: string; email: string; role: string };
type ProjectRow = {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  sourceOrg?: string | null;
  destinationOrg?: string | null;
  ownerEmail?: string;
  bytes?: number;
};
type OrgRow = { id: string; tenantId: string; userId: string; alias: string; ownerEmail?: string };

const SESSION_STORAGE_KEY = "sfdx.session";

function readStoredToken() {
  if (typeof window === "undefined") return null;
  const persisted = localStorage.getItem("token");
  if (persisted) return persisted;
  const session = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!session) return null;
  try {
    const parsed = JSON.parse(session);
    return typeof parsed?.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [token, setToken] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [authState, setAuthState] = useState<"loading" | "ready" | "signedOut">("loading");
  const [tenantName, setTenantName] = useState<string>("");
  const [tenantDomain, setTenantDomain] = useState<string>("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [message, setMessage] = useState<string>("");
  const [messageHelp, setMessageHelp] = useState<ErrorHelp | null>(null);
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [roleEdits, setRoleEdits] = useState<Record<string, string>>({});
  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [serviceDetails, setServiceDetails] = useState<any>(null);
  const [serviceOutput, setServiceOutput] = useState<string>("");
  const [features, setFeatures] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [newUserEmail, setNewUserEmail] = useState<string>("");
  const [newUserPassword, setNewUserPassword] = useState<string>("");
  const [newUserRole, setNewUserRole] = useState<string>("user");

  function bytesToGb(value: number | null | undefined) {
    if (!value) return 0;
    return Math.round((value / (1024 * 1024 * 1024)) * 10) / 10;
  }

  function formatBytes(bytes?: number) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      setAuthState("signedOut");
      return;
    }
    try {
      const payload = JSON.parse(atob(stored.split(".")[1] || ""));
      setRole(payload.role || "");
      setToken(stored);
      setAuthState("ready");
    } catch {
      setRole("");
      setToken("");
      setAuthState("signedOut");
    }
  }, []);

  useEffect(() => {
    if (authState !== "loading") return;
    const timeout = setTimeout(() => setAuthState("signedOut"), 1500);
    return () => clearTimeout(timeout);
  }, [authState]);

  async function api(path: string, options: RequestInit = {}) {
    const headers = options.headers ? new Headers(options.headers) : new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.assign("/");
      throw new Error("Session expired. Please sign in again.");
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ message: "Request failed" }));
      throw new Error(payload.message || payload.error || "Request failed");
    }
    return res.json();
  }

  function captureError(input: unknown) {
    const raw = input instanceof Error ? input.message : String(input || "Request failed");
    setMessage(raw);
    setMessageHelp(translateError(input));
  }

  async function loadOverview() {
    const data = await api("/api/company-admin/summary");
    setTenantName(data.tenant?.name || "Tenant");
    setTenantDomain(data.tenant?.domain || "");
    setUsage(data.usage || null);
    setLimits(data.limits || null);
  }

  function tenantTypeBadge(domain?: string | null) {
    const dedicated = domain?.startsWith("user:");
    return (
      <span
        className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
          dedicated ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {dedicated ? "Dedicated" : "Shared"}
      </span>
    );
  }

  async function loadUsers() {
    const data = await api("/api/company-admin/users");
    setUsers(data.users || []);
  }

  async function loadProjects() {
    const data = await api("/api/company-admin/projects");
    setProjects(data.projects || []);
  }

  async function loadOrgs() {
    const data = await api("/api/company-admin/orgs");
    setOrgs(data.orgs || []);
  }

  async function loadJobs() {
    const data = await api("/api/company-admin/jobs");
    setJobs(data.jobs || []);
  }

  async function handleStopJob(jobId: string) {
    await api("/api/company-admin/jobs/stop", {
      method: "POST",
      body: JSON.stringify({ jobId })
    });
    await loadJobs();
  }

  async function handleClearJobs(jobId?: string) {
    await api("/api/company-admin/jobs/clear", {
      method: "POST",
      body: JSON.stringify(jobId ? { jobId } : {})
    });
    await loadJobs();
  }

  async function handleDeleteProject(projectId: string) {
    await api("/api/company-admin/projects", {
      method: "DELETE",
      body: JSON.stringify({ projectId })
    });
    await loadProjects();
    await loadOverview();
  }

  async function refreshServices() {
    try {
      const data = await api("/api/services/status", { headers: {} });
      setServiceDetails(data);
    } catch (err: any) {
      setServiceDetails({ error: err.message });
      setMessageHelp(translateError(err));
    }
  }

  async function loadFeatures() {
    const data = await api("/api/company-admin/feature-flags");
    setFeatures(data.features || []);
  }

  async function toggleFeature(featureKey: string, current: boolean) {
    try {
      const data = await api("/api/company-admin/feature-flags", {
        method: "POST",
        body: JSON.stringify({ featureKey, enabled: !current })
      });
      setFeatures((prev) => prev.map((item) => (item.featureKey === featureKey ? data.feature : item)));
    } catch (err) {
      captureError(err);
    }
  }

  async function loadInsights() {
    const data = await api("/api/company-admin/ai-insights");
    setInsights(data.insights || []);
  }

  async function loadScans() {
    const data = await api("/api/company-admin/static-scans");
    setScans(data.scans || []);
  }

  async function loadDocs() {
    const data = await api("/api/company-admin/org-docs");
    setDocs(data.docs || []);
  }

  useEffect(() => {
    if (authState !== "ready" || !["company_admin", "super_admin"].includes(role)) return;
    loadOverview().catch(captureError);
    loadUsers().catch(captureError);
    loadProjects().catch(captureError);
    loadOrgs().catch(captureError);
    loadJobs().catch(captureError);
    refreshServices().catch(captureError);
    loadFeatures().catch(captureError);
    loadInsights().catch(captureError);
    loadScans().catch(captureError);
    loadDocs().catch(captureError);
  }, [authState, role, token]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const navGroups = useMemo(
    () => [
      {
        heading: "Overview",
        items: [{ id: "overview", label: "Usage Overview" }]
      },
      {
        heading: "Management",
        items: [
          { id: "users", label: "Users" },
          { id: "projects", label: "Projects" },
          { id: "orgs", label: "Orgs" },
          { id: "jobs", label: "Jobs" }
        ]
      },
      {
        heading: "AI + Insights",
        items: [
          { id: "features", label: "Feature Flags" },
          { id: "insights", label: "AI Insights" },
          { id: "scans", label: "Static Scans" },
          { id: "docs", label: "Org Docs" }
        ]
      }
    ],
    []
  );
  const sections = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

  if (authState === "loading") {
    return <div className="p-6 text-sm text-[var(--muted)]">Verifying session...</div>;
  }
  if (authState === "signedOut") {
    return <div className="p-6 text-sm text-[var(--muted)]">Please sign in.</div>;
  }
  if (!["company_admin", "super_admin"].includes(role)) {
    return <div className="p-6 text-sm text-[var(--muted)]">Forbidden.</div>;
  }

  return (
    <div data-theme="dark" className="min-h-screen bg-[var(--bg)] text-[var(--ink)]" style={{ colorScheme: "dark" }}>
      <div className="flex flex-col md:flex-row">
        <aside className="w-full border-b border-[var(--line)] bg-white/80 p-4 md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Company Admin</div>
          <div className="mt-4 space-y-4">
            {navGroups.map((group) => {
              const isOpen = openGroups[group.heading] ?? true;
              return (
                <div key={group.heading} className="space-y-2">
                  <button
                    className="flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left text-xs uppercase tracking-[0.2em] text-[var(--muted)] transition hover:border-[var(--line)] hover:bg-white"
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [group.heading]: !isOpen }))
                    }
                  >
                    <span>{group.heading}</span>
                    <span className="text-[10px]">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-2 px-1">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          className={`block w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                            activeSection === item.id
                              ? "border-[var(--accent)] bg-white text-[var(--accent-strong)] shadow-sm"
                              : "border-transparent hover:border-[var(--line)] hover:bg-white"
                          }`}
                          onClick={() => setActiveSection(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-3 text-xs text-[var(--muted)]">
            Manage users, projects, and orgs inside your tenant.
          </div>
        </aside>

        <main className="flex-1 px-0 py-0">
          <header className="glass sticky top-0 z-20 border-b border-[var(--line)]">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
              <div>
                <div className="text-lg font-semibold">SFDX DevOps Platform</div>
                <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Company Admin Console</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {serviceDetails && !serviceDetails.error ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
                      onClick={() => refreshServices().catch(captureError)}
                    >
                      Refresh
                    </button>
                    {Object.entries(serviceDetails).map(([key, value]: any) => (
                      <button
                        key={key}
                        className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                          value.status === "connected" || value.status === "running" || value.status === "locked"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                        onClick={() => setServiceOutput(JSON.stringify({ service: key, ...value }, null, 2))}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                  onClick={() => window.location.assign("/")}
                >
                  Back to App
                </button>
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">{tenantName}</div>
              <div className="text-lg font-semibold text-[var(--ink)]">Company Admin Dashboard</div>
              {message ? <div className="mt-2 text-xs text-rose-600">{message}</div> : null}
            </div>

            {messageHelp ? <ErrorHelpPanel help={messageHelp} /> : null}

            {serviceOutput ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-4 text-xs shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between">
                  <div className="text-[var(--muted)]">Service Details</div>
                  <button className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px]" onClick={() => setServiceOutput("")}>
                    Clear
                  </button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-[10px]">{serviceOutput}</pre>
              </section>
            ) : null}

            {activeSection === "overview" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="text-sm font-semibold">Usage & Limits</div>
                <div className="mt-4 grid gap-4 text-xs lg:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Users</div>
                    <div className="mt-2 text-lg font-semibold">
                      {usage?.users ?? 0} / {limits?.maxUsers ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Projects</div>
                    <div className="mt-2 text-lg font-semibold">
                      {usage?.projects ?? 0} / {limits?.maxProjects ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Orgs</div>
                    <div className="mt-2 text-lg font-semibold">
                      {usage?.orgs ?? 0} / {limits?.maxOrgs ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Storage</div>
                    <div className="mt-2 text-lg font-semibold">
                      {bytesToGb(usage?.storageBytes)} GB / {bytesToGb(limits?.maxStorageBytes)} GB
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Retrieves</div>
                    <div className="mt-2 text-lg font-semibold">
                      {usage?.retrieves ?? 0} / {limits?.maxRetrieves ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Deploys</div>
                    <div className="mt-2 text-lg font-semibold">
                      {usage?.deploys ?? 0} / {limits?.maxDeploys ?? "-"}
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Usage Detail</div>
                  <div className="mt-3 space-y-3 text-xs">
                    {[
                      { label: "Users", used: usage?.users ?? 0, max: limits?.maxUsers ?? 0 },
                      { label: "Projects", used: usage?.projects ?? 0, max: limits?.maxProjects ?? 0 },
                      { label: "Orgs", used: usage?.orgs ?? 0, max: limits?.maxOrgs ?? 0 },
                      { label: "Storage (GB)", used: bytesToGb(usage?.storageBytes), max: bytesToGb(limits?.maxStorageBytes) },
                      { label: "Retrieves", used: usage?.retrieves ?? 0, max: limits?.maxRetrieves ?? 0 },
                      { label: "Deploys", used: usage?.deploys ?? 0, max: limits?.maxDeploys ?? 0 }
                    ].map((item) => {
                      const percent = item.max ? Math.min(100, Math.round((item.used / item.max) * 100)) : 0;
                      return (
                        <div key={item.label} className="space-y-1">
                          <div className="flex items-center justify-between text-[var(--muted)]">
                            <span>{item.label}</span>
                            <span>{item.used} / {item.max || "-"}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-50">
                            <div
                              className="h-2 rounded-full bg-[var(--accent)]"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1"
                    onClick={() => loadOverview().catch(captureError)}
                  >
                    Refresh overview
                  </button>
                </div>
              </section>
            ) : null}

            {activeSection === "users" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Users</h2>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => loadUsers().catch(captureError)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-xs lg:grid-cols-[2fr_1fr_1fr_auto]">
                  <input
                    className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    placeholder="Email"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                  />
                  <input
                    className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    placeholder="Password"
                    type="password"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                  />
                  <select
                    className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    value={newUserRole}
                    onChange={(event) => setNewUserRole(event.target.value)}
                  >
                    <option value="user">user</option>
                    <option value="company_admin">company_admin</option>
                  </select>
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white"
                    onClick={async () => {
                      await api("/api/company-admin/users", {
                        method: "POST",
                        body: JSON.stringify({
                          email: newUserEmail,
                          password: newUserPassword,
                          role: newUserRole
                        })
                      });
                      setNewUserEmail("");
                      setNewUserPassword("");
                      setNewUserRole("user");
                      setMessageHelp(null);
                      await loadUsers();
                    }}
                  >
                    Add user
                  </button>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2">User ID</th>
                        <th className="px-3 py-2">User ID</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">New Password</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-[10px]">{user.id}</td>
                          <td className="px-3 py-2">{user.email}</td>
                          <td className="px-3 py-2">{tenantTypeBadge(tenantDomain)}</td>
                          <td className="px-3 py-2">
                            <select
                              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              value={roleEdits[user.id] || user.role}
                              onChange={(event) =>
                                setRoleEdits((prev) => ({ ...prev, [user.id]: event.target.value }))
                              }
                            >
                              <option value="user">user</option>
                              <option value="company_admin">company_admin</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="password"
                              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              placeholder="New password"
                              value={passwordEdits[user.id] || ""}
                              onChange={(event) =>
                                setPasswordEdits((prev) => ({ ...prev, [user.id]: event.target.value }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                              onClick={async () => {
                                await api("/api/company-admin/users", {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    userId: user.id,
                                    role: roleEdits[user.id] || user.role,
                                    password: passwordEdits[user.id] || undefined
                                  })
                                });
                                setPasswordEdits((prev) => ({ ...prev, [user.id]: "" }));
                                await loadUsers();
                                setMessageHelp(null);
                                setMessage("User updated.");
                              }}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeSection === "projects" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Projects</h2>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => loadProjects().catch(captureError)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Source Org</th>
                        <th className="px-3 py-2">Destination Org</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project) => (
                        <tr key={project.id} className="border-t">
                          <td className="px-3 py-2">{project.name}</td>
                          <td className="px-3 py-2">{project.ownerEmail || project.userId}</td>
                          <td className="px-3 py-2">{project.sourceOrg || "-"}</td>
                          <td className="px-3 py-2">{project.destinationOrg || "-"}</td>
                          <td className="px-3 py-2">{formatBytes(project.bytes)}</td>
                          <td className="px-3 py-2">
                            <button
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                              onClick={() => handleDeleteProject(project.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeSection === "orgs" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Orgs</h2>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => loadOrgs().catch(captureError)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2">Alias</th>
                        <th className="px-3 py-2">Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgs.map((org) => (
                        <tr key={org.id} className="border-t">
                          <td className="px-3 py-2">{org.alias}</td>
                          <td className="px-3 py-2">{org.ownerEmail || org.userId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeSection === "jobs" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Comparison Jobs</div>
                    <div className="text-xs text-[var(--muted)]">Stop running jobs or clear completed ones.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={loadJobs}>
                      Refresh
                    </button>
                    <button
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                      onClick={() => handleClearJobs()}
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  {jobs.length ? (
                    jobs.map((job) => (
                      <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{job.id.slice(0, 6)}</span>
                          <span className="uppercase text-[10px] text-[var(--muted)]">{job.status}</span>
                          <span className="text-[10px] text-[var(--muted)]">{job.projectName}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-[var(--muted)]">{new Date(job.createdAt).toLocaleString()}</span>
                          <button
                            className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px]"
                            onClick={() => handleStopJob(job.id)}
                          >
                            Stop
                          </button>
                          <button
                            className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                            onClick={() => handleClearJobs(job.id)}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[var(--muted)]">No jobs yet.</div>
                  )}
                </div>
              </section>
            ) : null}

            {activeSection === "features" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Premium AI & Ops Features</div>
                    <div className="text-xs text-[var(--muted)]">Toggle the automation bundles that carry extra billing.</div>
                  </div>
                  <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => loadFeatures().catch(captureError)}>
                    Refresh
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {features.map((feature) => (
                    <div key={feature.featureKey} className="flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-white p-4 text-xs">
                      <div>
                        <div className="text-sm font-semibold text-[var(--ink)]">{feature.label}</div>
                        <div className="mt-1 text-[var(--muted)]">{feature.description}</div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[10px] text-[var(--muted)]">
                          ${feature.cost.toFixed(2)} / {feature.unitName}
                        </span>
                        <button
                          className={`rounded-full border px-3 py-1 text-[10px] ${
                            feature.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                          onClick={() => toggleFeature(feature.featureKey, feature.enabled)}
                        >
                          {feature.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!features.length ? (
                    <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs text-[var(--muted)]">
                      No premium features are configured yet. Use the toggle to add AI-enhanced workflows.
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeSection === "insights" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">AI Deployment Insights</div>
                    <div className="text-xs text-[var(--muted)]">Autogenerated recommendations for failed jobs.</div>
                  </div>
                  <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => loadInsights().catch(captureError)}>
                    Refresh
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {insights.length ? (
                    insights.map((insight) => (
                      <div key={insight.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{insight.summary}</span>
                          <span
                            className={`text-[10px] uppercase ${
                              insight.severity === "error"
                                ? "text-rose-600"
                                : insight.severity === "warning"
                                ? "text-orange-600"
                                : "text-slate-500"
                            }`}
                          >
                            {insight.severity || "info"}
                          </span>
                        </div>
                        <p className="mt-2 text-[var(--muted)]">{insight.recommendation}</p>
                        {insight.rawError ? (
                          <details className="mt-2 text-[var(--muted)]">
                            <summary className="cursor-pointer text-[10px]">Show raw error</summary>
                            <pre className="mt-1 whitespace-pre-wrap text-[10px]">{insight.rawError}</pre>
                          </details>
                        ) : null}
                        <div className="mt-2 text-[10px] text-[var(--muted)]">
                          Job: {insight.jobId || "n/a"} • Generated {new Date(insight.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[var(--muted)]">No AI insights available yet. Run failing jobs and rerun the generator via `npm run ai:insights`.</div>
                  )}
                </div>
              </section>
            ) : null}

            {activeSection === "scans" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Static Scan Reports</div>
                    <div className="text-xs text-[var(--muted)]">Automated code hygiene reports ({scans.length} stored).</div>
                  </div>
                  <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => loadScans().catch(captureError)}>
                    Refresh
                  </button>
                </div>
                <div className="mt-4 text-[10px] text-[var(--muted)]">Run `npm run scan:static` to generate a fresh report.</div>
                <div className="mt-4 space-y-3">
                  {scans.length ? (
                    scans.map((scan) => (
                      <div key={scan.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Scan {scan.id}</span>
                          <span className="text-[10px] uppercase text-slate-500">{scan.status}</span>
                        </div>
                        <p className="mt-2 text-[var(--muted)]">{scan.summary}</p>
                        {scan.reportPath ? (
                          <div className="mt-2 text-[10px] text-[var(--muted)]">Report: {scan.reportPath}</div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-[var(--muted)]">No scans have been executed yet.</div>
                  )}
                </div>
              </section>
            ) : null}

            {activeSection === "docs" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Org Design Documents</div>
                    <div className="text-xs text-[var(--muted)]">AI-generated architecture briefs. Regenerate with `npm run doc:org`.</div>
                  </div>
                  <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => loadDocs().catch(captureError)}>
                    Refresh
                  </button>
                </div>
                <div className="mt-4 space-y-3 text-xs">
                  {docs.length ? (
                    docs.map((doc) => (
                      <div key={doc.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{doc.id}</span>
                          <span className="text-[10px] text-[var(--muted)]">{new Date(doc.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 text-[var(--muted)]">{doc.summary || "Generated org overview document."}</p>
                        <div className="mt-2 text-[10px] text-[var(--muted)]">Path: {doc.docPath}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[var(--muted)]">No documents yet.</div>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
