"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useMemo, useState } from "react";

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

type Tenant = {
  id: string;
  name: string;
  domain: string;
  plan: string;
  maxUsers?: number | null;
  maxProjects?: number | null;
  maxOrgs?: number | null;
  maxStorageBytes?: number | null;
  maxRetrieves?: number | null;
  maxDeploys?: number | null;
  usage?: { users: number; projects: number; orgs: number; storageBytes: number; retrieves: number; deploys: number };
};

type UserRow = { id: string; tenantId: string; email: string; role: string };
type ProjectRow = { id: string; userId: string; name: string; sourceOrg?: string | null; destinationOrg?: string | null; email?: string; bytes?: number };

export default function SuperAdminPage() {
  const [token, setToken] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [authState, setAuthState] = useState<"loading" | "ready" | "signedOut">("loading");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [limits, setLimits] = useState<any>({});
  const [message, setMessage] = useState<string>("");
  const [messageHelp, setMessageHelp] = useState<ErrorHelp | null>(null);
  const [newTenant, setNewTenant] = useState({ name: "", domain: "", plan: "free" });
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [serviceDetails, setServiceDetails] = useState<any>(null);
  const [serviceOutput, setServiceOutput] = useState<string>("");
  const [dbTables, setDbTables] = useState<string[]>([]);
  const [dbTable, setDbTable] = useState<string>("");
  const [dbRows, setDbRows] = useState<any[]>([]);
  const [dbStatsState, setDbStatsState] = useState<any>(null);
  const [dbEditor, setDbEditor] = useState<string>('{}');
  const [dbEditorId, setDbEditorId] = useState<string>("");
  const [dbError, setDbError] = useState<string>("");
  const [dbErrorHelp, setDbErrorHelp] = useState<ErrorHelp | null>(null);
  const [newUserEmail, setNewUserEmail] = useState<string>("");
  const [newUserPassword, setNewUserPassword] = useState<string>("");
  const [newUserRole, setNewUserRole] = useState<string>("user");
  const [newUserTenant, setNewUserTenant] = useState<string>("");
  const [adminSettings, setAdminSettings] = useState<{ defaultTenantPlan?: string; defaultTenantId?: string | null }>({});
  const [usageSeries, setUsageSeries] = useState<Array<{ day: string; retrieves: number; deploys: number }>>([]);
  const [storageLeaders, setStorageLeaders] = useState<Array<{ id: string; name: string; email: string; bytes: number }>>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<Array<any>>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [tenantFeatures, setTenantFeatures] = useState<any[]>([]);
  const [tenantInsights, setTenantInsights] = useState<any[]>([]);
  const [tenantScans, setTenantScans] = useState<any[]>([]);
  const [tenantDocs, setTenantDocs] = useState<any[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [auditLogs, setAuditLogs] = useState<Array<any>>([]);
  const [health, setHealth] = useState<any>(null);
  const limitFields = ["maxUsers", "maxProjects", "maxOrgs", "maxRetrieves", "maxDeploys"] as const;

  function bytesToGb(value: number | null | undefined) {
    if (!value) return 0;
    return Math.round((value / (1024 * 1024 * 1024)) * 10) / 10;
  }

  function gbToBytes(value: number) {
    return Math.max(0, Math.round(value * 1024 * 1024 * 1024));
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
    const timer = setTimeout(() => setAuthState("signedOut"), 1500);
    return () => clearTimeout(timer);
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

  function captureDbError(input: unknown) {
    const raw = input instanceof Error ? input.message : String(input || "Request failed");
    setDbError(raw);
    setDbErrorHelp(translateError(input));
  }

  async function loadAll() {
    const [tenantData, limitData, userData] = await Promise.all([
      api("/api/admin/tenants"),
      api("/api/admin/limits"),
      api("/api/admin/users")
    ]);
    setTenants(tenantData.tenants || []);
    setLimits(limitData.limits || {});
    setUsers(userData.users || []);
    if (!newUserTenant && tenantData.tenants?.length) {
      setNewUserTenant(tenantData.tenants[0].id);
    }
  }

  async function loadProjects() {
    const data = await api("/api/admin/projects");
    setProjects(data.projects || []);
  }

  async function loadSettings() {
    const data = await api("/api/admin/settings");
    setAdminSettings(data || {});
  }

  async function loadUsageSeries() {
    const data = await api("/api/admin/usage");
    setUsageSeries(data.series || []);
  }

  async function loadStorageLeaders() {
    const data = await api("/api/admin/storage");
    setStorageLeaders(data.projects || []);
  }

  async function loadUpgradeRequests() {
    const data = await api("/api/admin/upgrades");
    setUpgradeRequests(data.requests || []);
  }

  async function loadJobs() {
    const data = await api("/api/admin/jobs");
    setJobs(data.jobs || []);
  }

  async function loadAuditLogs() {
    const data = await api("/api/admin/audit?limit=100");
    setAuditLogs(data.logs || []);
  }

  async function loadHealth() {
    const data = await api("/api/admin/health");
    setHealth(data || null);
  }

  async function handleStopJob(jobId: string) {
    await api("/api/admin/jobs/stop", {
      method: "POST",
      body: JSON.stringify({ jobId })
    });
    await loadJobs();
  }

  async function handleClearJobs(jobId?: string) {
    await api("/api/admin/jobs/clear", {
      method: "POST",
      body: JSON.stringify(jobId ? { jobId } : {})
    });
    await loadJobs();
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

  async function loadTenantFeatures(tenantId: string) {
    const data = await api(`/api/admin/feature-flags?tenantId=${encodeURIComponent(tenantId)}`);
    setTenantFeatures(data.features || []);
  }

  async function toggleTenantFeature(featureKey: string, current: boolean) {
    if (!selectedTenantId) return;
    const data = await api("/api/admin/feature-flags", {
      method: "POST",
      body: JSON.stringify({ tenantId: selectedTenantId, featureKey, enabled: !current })
    });
    setTenantFeatures((prev) => prev.map((item) => (item.featureKey === featureKey ? data.feature : item)));
  }

  async function loadTenantInsights(tenantId: string) {
    const data = await api(`/api/admin/ai-insights?tenantId=${encodeURIComponent(tenantId)}`);
    setTenantInsights(data.insights || []);
  }

  async function loadTenantScans(tenantId: string) {
    const data = await api(`/api/admin/static-scans?tenantId=${encodeURIComponent(tenantId)}`);
    setTenantScans(data.scans || []);
  }

  async function loadTenantDocs(tenantId: string) {
    const data = await api(`/api/admin/org-docs?tenantId=${encodeURIComponent(tenantId)}`);
    setTenantDocs(data.docs || []);
  }

  async function loadDbOverview() {
    const data = await api("/api/db/overview");
    setDbStatsState(data.stats || null);
  }

  async function loadDbTables() {
    const data = await api("/api/db/tables");
    setDbTables(data.tables || []);
    if (data.tables?.length && !dbTable) {
      setDbTable(data.tables[0]);
    }
  }

  async function loadDbTable(name: string, offset = 0) {
    if (!name) return;
    const data = await api(`/api/db/table?name=${encodeURIComponent(name)}&limit=25&offset=${offset}`);
    setDbRows(data.rows || []);
  }

  async function handleDbInsert() {
    try {
      setDbError("");
      setDbErrorHelp(null);
      const data = JSON.parse(dbEditor || "{}");
      await api("/api/db/row", { method: "POST", body: JSON.stringify({ name: dbTable, data }) });
      loadDbTable(dbTable, 0);
    } catch (err: any) {
      captureDbError(err);
    }
  }

  async function handleDbUpdate() {
    try {
      setDbError("");
      setDbErrorHelp(null);
      const data = JSON.parse(dbEditor || "{}");
      if (!dbEditorId) {
        captureDbError("Row id is required for update.");
        return;
      }
      await api("/api/db/row", { method: "PATCH", body: JSON.stringify({ name: dbTable, id: dbEditorId, data }) });
      loadDbTable(dbTable, 0);
    } catch (err: any) {
      captureDbError(err);
    }
  }

  async function handleDbDelete(id: string) {
    try {
      setDbError("");
      setDbErrorHelp(null);
      await api("/api/db/row", { method: "DELETE", body: JSON.stringify({ name: dbTable, id }) });
      loadDbTable(dbTable, 0);
    } catch (err: any) {
      captureDbError(err);
    }
  }

  useEffect(() => {
    if (authState !== "ready" || role !== "super_admin") return;
    loadAll().catch(captureError);
    loadProjects().catch(captureError);
    loadSettings().catch(captureError);
    loadUsageSeries().catch(captureError);
    loadStorageLeaders().catch(captureError);
    loadUpgradeRequests().catch(captureError);
    loadJobs().catch(captureError);
    loadAuditLogs().catch(captureError);
    loadHealth().catch(captureError);
    refreshServices().catch(captureError);
    loadDbOverview().catch(captureError);
    loadDbTables().catch(captureError);
  }, [role, authState]);

  useEffect(() => {
    if (role !== "super_admin") return;
    const timer = setInterval(() => {
      loadUpgradeRequests().catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, [role, authState]);

  useEffect(() => {
    if (authState !== "ready" || !selectedTenantId) return;
    loadTenantFeatures(selectedTenantId).catch(() => undefined);
    loadTenantInsights(selectedTenantId).catch(() => undefined);
    loadTenantScans(selectedTenantId).catch(() => undefined);
    loadTenantDocs(selectedTenantId).catch(() => undefined);
  }, [selectedTenantId]);

  const pendingUpgrades = upgradeRequests.filter((request) => request.status === "pending").length;
  const navGroups = useMemo(
    () => [
      {
        heading: "Platform",
        items: [
          { id: "overview", label: "Overview" },
          { id: "health", label: "Health" },
          { id: "limits", label: "Plan Limits" }
        ]
      },
      {
        heading: "Tenant Ops",
        items: [
          { id: "tenants", label: "Tenants" },
          { id: "users", label: "Users" },
          { id: "projects", label: "Projects" },
          { id: "jobs", label: "Jobs" }
        ]
      },
      {
        heading: "AI & Insights",
        items: [
          { id: "features", label: "Feature Flags" },
          { id: "insights", label: "AI Insights" },
          { id: "scans", label: "Static Scans" },
          { id: "docs", label: "Org Docs" }
        ]
      },
      {
        heading: "Governance",
        items: [
          { id: "upgrades", label: pendingUpgrades ? `Upgrade Requests (${pendingUpgrades})` : "Upgrade Requests" },
          { id: "audit", label: "Audit Logs" },
          { id: "database", label: "Database" }
        ]
      }
    ],
    [pendingUpgrades]
  );
  const sections = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

  if (authState === "loading") {
    return <div className="p-6 text-sm text-[var(--muted)]">Verifying session...</div>;
  }
  if (authState === "signedOut") {
    return <div className="p-6 text-sm text-[var(--muted)]">Please sign in.</div>;
  }
  if (role !== "super_admin") {
    return <div className="p-6 text-sm text-[var(--muted)]">Forbidden.</div>;
  }

  return (
    <div data-theme="dark" className="min-h-screen bg-[var(--bg)] text-[var(--ink)]" style={{ colorScheme: "dark" }}>
      <div className="flex flex-col md:flex-row">
        <aside className="w-full border-b border-[var(--line)] bg-white/80 p-4 md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Super Admin</div>
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
            Configure global limits, tenants, and user roles across the platform.
          </div>
        </aside>

        <main className="flex-1 px-0 py-0">
          <header className="glass sticky top-0 z-20 border-b border-[var(--line)]">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
              <div>
                <div className="text-lg font-semibold">SFDX DevOps Platform</div>
                <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Super Admin Console</div>
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
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Configuration Dashboard</div>
              <div className="text-lg font-semibold text-[var(--ink)]">Super Admin</div>
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
                <div className="text-sm font-semibold">Platform Snapshot</div>
                <div className="mt-4 grid gap-4 text-xs lg:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Tenants</div>
                    <div className="mt-2 text-lg font-semibold">{tenants.length}</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Users</div>
                    <div className="mt-2 text-lg font-semibold">{users.length}</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Plans</div>
                    <div className="mt-2 text-lg font-semibold">3 tiers</div>
                  </div>
                </div>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Usage Totals</div>
                  <div className="mt-3 grid gap-4 text-xs lg:grid-cols-3">
                    {(() => {
                      const totals = tenants.reduce(
                        (acc, tenant) => {
                          acc.users += tenant.usage?.users || 0;
                          acc.projects += tenant.usage?.projects || 0;
                          acc.orgs += tenant.usage?.orgs || 0;
                          acc.storageBytes += tenant.usage?.storageBytes || 0;
                          acc.retrieves += tenant.usage?.retrieves || 0;
                          acc.deploys += tenant.usage?.deploys || 0;
                          return acc;
                        },
                        { users: 0, projects: 0, orgs: 0, storageBytes: 0, retrieves: 0, deploys: 0 }
                      );
                      return (
                        <>
                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <div className="text-[var(--muted)]">Total Users</div>
                            <div className="mt-2 text-lg font-semibold">{totals.users}</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <div className="text-[var(--muted)]">Total Projects</div>
                            <div className="mt-2 text-lg font-semibold">{totals.projects}</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <div className="text-[var(--muted)]">Total Orgs</div>
                            <div className="mt-2 text-lg font-semibold">{totals.orgs}</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <div className="text-[var(--muted)]">Total Storage</div>
                            <div className="mt-2 text-lg font-semibold">{bytesToGb(totals.storageBytes)} GB</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <div className="text-[var(--muted)]">Total Retrieves</div>
                            <div className="mt-2 text-lg font-semibold">{totals.retrieves}</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                            <div className="text-[var(--muted)]">Total Deploys</div>
                            <div className="mt-2 text-lg font-semibold">{totals.deploys}</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Defaults</div>
                  <div className="mt-3 grid gap-4 text-xs lg:grid-cols-[1fr_1fr_auto]">
                    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                      <div className="text-[var(--muted)]">Default tenant plan</div>
                      <select
                        className="mt-2 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                        value={adminSettings.defaultTenantPlan || "free"}
                        onChange={(event) =>
                          setAdminSettings((prev) => ({ ...prev, defaultTenantPlan: event.target.value }))
                        }
                      >
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                        <option value="enterprise">enterprise</option>
                      </select>
                    </div>
                    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                      <div className="text-[var(--muted)]">Default tenant for domainless users</div>
                      <select
                        className="mt-2 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                        value={adminSettings.defaultTenantId || ""}
                        onChange={(event) =>
                          setAdminSettings((prev) => ({ ...prev, defaultTenantId: event.target.value || null }))
                        }
                      >
                        <option value="">(first tenant)</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs text-white"
                        onClick={async () => {
                          await api("/api/admin/settings", {
                            method: "PATCH",
                            body: JSON.stringify(adminSettings)
                          });
                          await loadSettings();
                          setMessageHelp(null);
                          setMessage("Defaults saved.");
                        }}
                      >
                        Save defaults
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Tenant Usage</div>
                  <div className="mt-3 overflow-auto rounded-2xl border border-[var(--line)]">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2">Tenant</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Plan</th>
                          <th className="px-3 py-2">Users</th>
                          <th className="px-3 py-2">Projects</th>
                          <th className="px-3 py-2">Orgs</th>
                        </tr>
                      </thead>
                      <tbody>
                      {tenants.map((tenant) => (
                        <tr key={tenant.id} className="border-t">
                          <td className="px-3 py-2">
                            <button
                              className="text-left text-[var(--accent-strong)] hover:underline"
                              onClick={() => setSelectedTenantId(tenant.id)}
                              title="View users in this tenant"
                            >
                              {tenant.name}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                                tenant.domain?.startsWith("user:")
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {tenant.domain?.startsWith("user:") ? "Dedicated" : "Shared"}
                            </span>
                          </td>
                          <td className="px-3 py-2">{tenant.plan}</td>
                          <td className="px-3 py-2">{tenant.usage?.users ?? 0}</td>
                            <td className="px-3 py-2">{tenant.usage?.projects ?? 0}</td>
                            <td className="px-3 py-2">{tenant.usage?.orgs ?? 0}</td>
                          </tr>
                        ))}
                        {!tenants.length ? (
                          <tr>
                            <td className="px-3 py-4 text-[var(--muted)]" colSpan={5}>
                              No tenants yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="text-[var(--muted)]">Cleanup removes tenants with 0 users/projects/orgs.</div>
                    <button
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                      onClick={async () => {
                        await api("/api/admin/tenants", {
                          method: "PUT",
                          body: JSON.stringify({ mode: "cleanup_empty" })
                        });
                        await loadAll();
                      }}
                    >
                      Delete empty tenants
                    </button>
                  </div>
                </div>
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-[var(--line)] bg-white/90 p-4 shadow-[var(--card-shadow)]">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Retrieve & Deploy Trend (30 days)</div>
                    <div className="mt-3 space-y-2 text-[10px]">
                      {usageSeries.length ? (
                        usageSeries.map((row) => {
                          const max = Math.max(row.retrieves, row.deploys, 1);
                          return (
                            <div key={row.day} className="space-y-1">
                              <div className="flex items-center justify-between text-[var(--muted)]">
                                <span>{row.day}</span>
                                <span>R {row.retrieves} · D {row.deploys}</span>
                              </div>
                              <div className="flex gap-2">
                                <div className="h-2 flex-1 rounded-full bg-slate-50">
                                  <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${(row.retrieves / max) * 100}%` }} />
                                </div>
                                <div className="h-2 flex-1 rounded-full bg-slate-50">
                                  <div className="h-2 rounded-full bg-rose-200" style={{ width: `${(row.deploys / max) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-[var(--muted)]">No activity yet.</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-[var(--line)] bg-white/90 p-4 shadow-[var(--card-shadow)]">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Top Storage Projects</div>
                    <div className="mt-3 space-y-2 text-xs">
                      {storageLeaders.length ? (
                        storageLeaders.map((project) => (
                          <div key={project.id} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-3 py-2">
                            <div>
                              <div className="text-[var(--ink)]">{project.name}</div>
                              <div className="text-[10px] text-[var(--muted)]">{project.email}</div>
                            </div>
                            <div className="text-[var(--muted)]">{formatBytes(project.bytes)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[var(--muted)]">No storage data yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "health" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">System Health</h2>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => loadHealth().catch(captureError)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 grid gap-4 text-xs lg:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Database</div>
                    <div className="mt-2 text-lg font-semibold">{health?.db?.users ?? 0} users</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {health?.db?.projects ?? 0} projects · {health?.db?.orgs ?? 0} orgs
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">Tenants</div>
                    <div className="mt-2 text-lg font-semibold">{health?.tenants ?? 0}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      Storage: {health ? `${(health.storageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : "0 GB"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">SF CLI</div>
                    <div className="mt-2 text-lg font-semibold">
                      {health?.sf?.status === "connected" ? "Connected" : "Missing"}
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {health?.sf?.details || "sf CLI not found"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="text-[var(--muted)]">SF CLI Updater</div>
                    <div className="mt-2 text-lg font-semibold">
                      {health?.sfCliUpdater?.serviceEnabled && health?.sfCliUpdater?.timerEnabled ? "Boot Enabled" : "Not Enabled"}
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {health?.sfCliUpdater?.message || "No updater status available"}
                    </div>
                    <div className="mt-2 text-[10px] text-[var(--muted)]">
                      {health?.sfCliUpdater?.currentVersion ? `Installed ${health.sfCliUpdater.currentVersion}` : ""}
                      {health?.sfCliUpdater?.latestVersion ? ` · Latest ${health.sfCliUpdater.latestVersion}` : ""}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "limits" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Plan Limits</h2>
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white"
                    onClick={async () => {
                      await api("/api/admin/limits", { method: "PATCH", body: JSON.stringify({ limits }) });
                      setMessageHelp(null);
                      setMessage("Plan limits saved.");
                    }}
                  >
                    Save limits
                  </button>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {["free", "pro", "enterprise"].map((plan) => (
                    <div key={plan} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{plan}</div>
                      <div className="mt-3 space-y-2 text-xs">
                        {[
                          { key: "maxUsers", label: "max users" },
                          { key: "maxProjects", label: "max projects" },
                          { key: "maxOrgs", label: "max orgs" },
                          { key: "maxRetrieves", label: "max retrieves" },
                          { key: "maxDeploys", label: "max deploys" }
                        ].map((field) => (
                          <label key={field.key} className="flex items-center justify-between gap-2">
                            <span className="text-[var(--muted)]">{field.label}</span>
                            <input
                              className="w-24 rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              value={limits?.[plan]?.[field.key] ?? ""}
                              onChange={(event) =>
                                setLimits((prev: any) => ({
                                  ...prev,
                                  [plan]: { ...(prev?.[plan] || {}), [field.key]: Number(event.target.value || 0) }
                                }))
                              }
                            />
                          </label>
                        ))}
                        <label className="flex items-center justify-between gap-2">
                          <span className="text-[var(--muted)]">max storage (GB)</span>
                          <input
                            className="w-24 rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                            value={bytesToGb(limits?.[plan]?.maxStorageBytes)}
                            onChange={(event) => {
                              const nextGb = Number(event.target.value || 0);
                              setLimits((prev: any) => ({
                                ...prev,
                                [plan]: { ...(prev?.[plan] || {}), maxStorageBytes: gbToBytes(nextGb) }
                              }));
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {activeSection === "tenants" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Tenants</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                      onClick={() => loadAll().catch(captureError)}
                    >
                      Refresh
                    </button>
                    <button
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                      onClick={async () => {
                        await api("/api/admin/tenants", {
                          method: "PUT",
                          body: JSON.stringify({ mode: "cleanup_empty" })
                        });
                        await loadAll();
                      }}
                    >
                      Delete empty tenants
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
                  <input
                    className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs"
                    placeholder="Tenant name"
                    value={newTenant.name}
                    onChange={(event) => setNewTenant({ ...newTenant, name: event.target.value })}
                  />
                  <input
                    className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs"
                    placeholder="Domain"
                    value={newTenant.domain}
                    onChange={(event) => setNewTenant({ ...newTenant, domain: event.target.value })}
                  />
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs text-white"
                    onClick={async () => {
                      await api("/api/admin/tenants", { method: "POST", body: JSON.stringify(newTenant) });
                      setNewTenant({ name: "", domain: "", plan: "free" });
                      await loadAll();
                    }}
                  >
                    Create tenant
                  </button>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Domain</th>
                        <th className="px-3 py-2">Plan</th>
                        <th className="px-3 py-2">Usage</th>
                        <th className="px-3 py-2">Storage</th>
                        <th className="px-3 py-2">Runs</th>
                        <th className="px-3 py-2">Overrides</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => (
                        <tr key={tenant.id} className="border-t">
                          <td className="px-3 py-2">
                            <button
                              className="text-left text-[var(--accent-strong)] hover:underline"
                              onClick={() => setSelectedTenantId(tenant.id)}
                              title="View users in this tenant"
                            >
                              {tenant.name}
                            </button>
                          </td>
                          <td className="px-3 py-2">{tenantTypeBadge(tenant.domain)}</td>
                          <td className="px-3 py-2">{tenant.domain || "-"}</td>
                          <td className="px-3 py-2">
                            <select
                              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              value={tenant.plan}
                              onChange={async (event) => {
                                await api("/api/admin/tenants", {
                                  method: "PATCH",
                                  body: JSON.stringify({ tenantId: tenant.id, plan: event.target.value })
                                });
                                await loadAll();
                              }}
                            >
                              <option value="free">free</option>
                              <option value="pro">pro</option>
                              <option value="enterprise">enterprise</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {tenant.usage ? `${tenant.usage.users}/${tenant.usage.projects}/${tenant.usage.orgs}` : "-"}
                          </td>
                          <td className="px-3 py-2">
                            {tenant.usage ? `${bytesToGb(tenant.usage.storageBytes)} GB` : "-"}
                          </td>
                          <td className="px-3 py-2">
                            {tenant.usage ? `${tenant.usage.retrieves}/${tenant.usage.deploys}` : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                        {limitFields.map((field) => (
                          <input
                            key={field}
                            className="w-20 rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                            placeholder={field}
                            value={tenant[field] ?? ""}
                            onChange={(event) =>
                              setTenants((prev) =>
                                      prev.map((item) =>
                                        item.id === tenant.id ? { ...item, [field]: Number(event.target.value || 0) } : item
                                      )
                                    )
                                  }
                            onBlur={async (event) => {
                              const value = Number(event.target.value || 0);
                              await api("/api/admin/tenants", {
                                method: "PATCH",
                                body: JSON.stringify({ tenantId: tenant.id, limits: { [field]: value } })
                              });
                            }}
                          />
                        ))}
                        <input
                          className="w-20 rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                          placeholder="storage GB"
                          value={bytesToGb(tenant.maxStorageBytes)}
                          onChange={(event) =>
                            setTenants((prev) =>
                              prev.map((item) =>
                                item.id === tenant.id ? { ...item, maxStorageBytes: gbToBytes(Number(event.target.value || 0)) } : item
                              )
                            )
                          }
                          onBlur={async (event) => {
                            const value = gbToBytes(Number(event.target.value || 0));
                            await api("/api/admin/tenants", {
                              method: "PATCH",
                              body: JSON.stringify({ tenantId: tenant.id, limits: { maxStorageBytes: value } })
                            });
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                        onClick={async () => {
                          await api("/api/admin/tenants", {
                            method: "DELETE",
                            body: JSON.stringify({ tenantId: tenant.id })
                          });
                          await loadAll();
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                    </tbody>
                  </table>
                </div>
                {selectedTenantId ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Tenant Users</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px]"
                          onClick={() => loadAll().catch(captureError)}
                        >
                          Refresh
                        </button>
                        <button
                          className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px]"
                          onClick={() => setSelectedTenantId("")}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 overflow-auto rounded-xl border border-[var(--line)]">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2">User ID</th>
                            <th className="px-3 py-2">Email</th>
                            <th className="px-3 py-2">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.filter((user) => user.tenantId === selectedTenantId).map((user) => (
                            <tr key={user.id} className="border-t">
                              <td className="px-3 py-2 font-mono text-[10px]">{user.id}</td>
                              <td className="px-3 py-2">{user.email}</td>
                              <td className="px-3 py-2">{user.role}</td>
                            </tr>
                          ))}
                          {!users.filter((user) => user.tenantId === selectedTenantId).length ? (
                            <tr>
                              <td className="px-3 py-3 text-[var(--muted)]" colSpan={3}>
                                No users in this tenant.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeSection === "users" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Users</h2>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => loadAll().catch(captureError)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-xs lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
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
                    <option value="super_admin">super_admin</option>
                  </select>
                  <select
                    className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    value={newUserTenant}
                    onChange={(event) => setNewUserTenant(event.target.value)}
                  >
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white"
                    onClick={async () => {
                      await api("/api/admin/users", {
                        method: "PUT",
                        body: JSON.stringify({
                          email: newUserEmail,
                          password: newUserPassword,
                          role: newUserRole,
                          tenantId: newUserTenant
                        })
                      });
                      setNewUserEmail("");
                      setNewUserPassword("");
                      setNewUserRole("user");
                      await loadAll();
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
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Tenant</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-[10px]">{user.id}</td>
                          <td className="px-3 py-2">{user.email}</td>
                          <td className="px-3 py-2">
                            {tenantTypeBadge(tenants.find((tenant) => tenant.id === user.tenantId)?.domain || "")}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              value={user.role}
                              onChange={async (event) => {
                                await api("/api/admin/users", {
                                  method: "PATCH",
                                  body: JSON.stringify({ userId: user.id, role: event.target.value })
                                });
                                await loadAll();
                              }}
                            >
                              <option value="user">user</option>
                              <option value="company_admin">company_admin</option>
                              <option value="super_admin">super_admin</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              value={user.tenantId}
                              onChange={async (event) => {
                                await api("/api/admin/users/tenant", {
                                  method: "PATCH",
                                  body: JSON.stringify({ userId: user.id, tenantId: event.target.value })
                                });
                                await loadAll();
                              }}
                            >
                              {tenants.map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>
                                  {tenant.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                              onClick={async () => {
                                await api("/api/admin/users", {
                                  method: "DELETE",
                                  body: JSON.stringify({ userId: user.id })
                                });
                                await loadAll();
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedTenantId ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        Tenant Users
                      </div>
                      <button
                        className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px]"
                        onClick={() => setSelectedTenantId("")}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-3 overflow-auto rounded-xl border border-[var(--line)]">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                          <tr>
                            <th className="px-3 py-2">User ID</th>
                            <th className="px-3 py-2">Email</th>
                            <th className="px-3 py-2">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.filter((user) => user.tenantId === selectedTenantId).map((user) => (
                            <tr key={user.id} className="border-t">
                              <td className="px-3 py-2 font-mono text-[10px]">{user.id}</td>
                              <td className="px-3 py-2">{user.email}</td>
                              <td className="px-3 py-2">{user.role}</td>
                            </tr>
                          ))}
                          {!users.filter((user) => user.tenantId === selectedTenantId).length ? (
                            <tr>
                              <td className="px-3 py-3 text-[var(--muted)]" colSpan={3}>
                                No users in this tenant.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
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
                        <th className="px-3 py-2">Project</th>
                        <th className="px-3 py-2">Owner</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Destination</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project) => (
                        <tr key={project.id} className="border-t">
                          <td className="px-3 py-2">{project.name}</td>
                          <td className="px-3 py-2">{project.email || project.userId}</td>
                          <td className="px-3 py-2">{project.sourceOrg || "unset"}</td>
                          <td className="px-3 py-2">{project.destinationOrg || "unset"}</td>
                          <td className="px-3 py-2">{formatBytes(project.bytes)}</td>
                          <td className="px-3 py-2">
                            <button
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                              onClick={async () => {
                                await api("/api/admin/projects", {
                                  method: "DELETE",
                                  body: JSON.stringify({ projectId: project.id, userId: project.userId })
                                });
                                await loadProjects();
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!projects.length ? (
                        <tr>
                          <td className="px-3 py-4 text-[var(--muted)]" colSpan={6}>
                            No projects available.
                          </td>
                        </tr>
                      ) : null}
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
                          <span className="text-[10px] text-[var(--muted)]">{job.email}</span>
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

            {activeSection === "upgrades" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Upgrade Requests</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                      onClick={() => loadUpgradeRequests().catch(captureError)}
                    >
                      Refresh
                    </button>
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                      onClick={async () => {
                        const data = await api("/api/admin/upgrades/sync", { method: "POST" });
                        setMessageHelp(null);
                        setMessage(data.message || "Sync completed.");
                        await loadUpgradeRequests();
                        await loadAll();
                      }}
                    >
                      Sync Approved
                    </button>
                  </div>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">Tenant</th>
                        <th className="px-3 py-2">Requested Plan</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Created</th>
                        <th className="px-3 py-2">Applied</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upgradeRequests.map((request) => (
                        <tr key={request.id} className="border-t">
                          <td className="px-3 py-2">{request.email}</td>
                          <td className="px-3 py-2">{request.tenantName}</td>
                          <td className="px-3 py-2">{request.requestedPlan}</td>
                          <td className="px-3 py-2">{request.status}</td>
                          <td className="px-3 py-2">{request.createdAt?.slice(0, 10)}</td>
                          <td className="px-3 py-2">{request.appliedAt ? request.appliedAt.slice(0, 10) : "-"}</td>
                          <td className="px-3 py-2">
                            {request.status === "pending" ? (
                              <>
                                <button
                                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700"
                                  onClick={async () => {
                                    await api("/api/admin/upgrades", {
                                      method: "POST",
                                      body: JSON.stringify({ requestId: request.id, action: "approved" })
                                    });
                                    await loadUpgradeRequests();
                                    await loadAll();
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                                  onClick={async () => {
                                    await api("/api/admin/upgrades", {
                                      method: "POST",
                                      body: JSON.stringify({ requestId: request.id, action: "rejected" })
                                    });
                                    await loadUpgradeRequests();
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            ) : request.status === "approved" ? (
                              <button
                                className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px]"
                                onClick={async () => {
                                  await api("/api/admin/upgrades", {
                                    method: "POST",
                                    body: JSON.stringify({ requestId: request.id, action: "approved" })
                                  });
                                  await loadUpgradeRequests();
                                  await loadAll();
                                }}
                              >
                                Apply Plan
                              </button>
                            ) : (
                              <span className="text-[var(--muted)]">Resolved</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!upgradeRequests.length ? (
                        <tr>
                          <td className="px-3 py-4 text-[var(--muted)]" colSpan={6}>
                            No upgrade requests yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeSection === "audit" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Audit Logs</h2>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => loadAuditLogs().catch(captureError)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">Target</th>
                        <th className="px-3 py-2">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="border-t">
                          <td className="px-3 py-2">{log.createdAt?.slice(0, 19)?.replace("T", " ")}</td>
                          <td className="px-3 py-2">{log.action}</td>
                          <td className="px-3 py-2 font-mono text-[10px]">{log.userId || "-"}</td>
                          <td className="px-3 py-2">
                            {log.targetType ? `${log.targetType}:${log.targetId || "-"}` : "-"}
                          </td>
                          <td className="px-3 py-2">{log.ip || "-"}</td>
                        </tr>
                      ))}
                      {!auditLogs.length ? (
                        <tr>
                          <td className="px-3 py-4 text-[var(--muted)]" colSpan={5}>
                            No audit events yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeSection === "database" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Database</h2>
                    <p className="text-xs text-[var(--muted)]">SQLite overview and table editor.</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={loadDbOverview}>
                      Refresh stats
                    </button>
                    <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={loadDbTables}>
                      Refresh tables
                    </button>
                  </div>
                </div>
                {dbStatsState ? (
                  <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                    {Object.entries(dbStatsState).map(([key, value]) => (
                      <span key={key} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 uppercase tracking-[0.2em] text-[var(--muted)]">
                        {key}: {value as any}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Tables</div>
                    <div className="mt-3 space-y-2">
                      {dbTables.length ? (
                        dbTables.map((table) => (
                          <button
                            key={table}
                            className={`w-full rounded-lg border px-2 py-1 text-left text-xs ${
                              dbTable === table ? "border-[var(--accent)] text-[var(--accent-strong)]" : "border-[var(--line)]"
                            }`}
                            onClick={() => {
                              setDbTable(table);
                              loadDbTable(table, 0);
                            }}
                          >
                            {table}
                          </button>
                        ))
                      ) : (
                        <div className="text-xs text-[var(--muted)]">No tables yet.</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        {dbTable || "Select a table"}
                      </div>
                      {dbTable ? (
                        <button
                          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                          onClick={() => loadDbTable(dbTable, 0)}
                        >
                          Reload
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 overflow-auto">
                      {dbRows.length ? (
                        <table className="min-w-full text-xs">
                          <thead className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                            <tr>
                              {Object.keys(dbRows[0]).map((key) => (
                                <th key={key} className="px-2 py-1">
                                  {key}
                                </th>
                              ))}
                              <th className="px-2 py-1">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dbRows.map((row, idx) => (
                              <tr key={idx} className="border-t">
                                {Object.keys(row).map((key) => (
                                  <td key={`${idx}-${key}`} className="px-2 py-1 font-mono">
                                    {String(row[key]).slice(0, 120)}
                                  </td>
                                ))}
                                <td className="px-2 py-1">
                                  <button
                                    className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px]"
                                    onClick={() => {
                                      setDbEditorId(String(row.id || ""));
                                      setDbEditor(JSON.stringify(row, null, 2));
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                                    onClick={() => handleDbDelete(String(row.id || ""))}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-xs text-[var(--muted)]">Select a table to view rows.</div>
                      )}
                    </div>
                    <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Row editor</div>
                      {dbError ? <div className="mt-2 text-xs text-rose-600">{dbError}</div> : null}
                      {dbErrorHelp ? <div className="mt-3"><ErrorHelpPanel help={dbErrorHelp} /></div> : null}
                      <input
                        className="mt-2 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                        placeholder="Row id (for update/delete)"
                        value={dbEditorId}
                        onChange={(event) => setDbEditorId(event.target.value)}
                      />
                      <textarea
                        className="mt-2 h-40 w-full rounded-lg border border-[var(--line)] px-2 py-1 font-mono text-xs"
                        value={dbEditor}
                        onChange={(event) => setDbEditor(event.target.value)}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={handleDbInsert}>
                          Insert
                        </button>
                        <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={handleDbUpdate}>
                          Update
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "features" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Feature Flags</div>
                    <div className="text-xs text-[var(--muted)]">Toggle premium features for the selected tenant.</div>
                  </div>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => (selectedTenantId ? loadTenantFeatures(selectedTenantId).catch(captureError) : null)}
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  <label className="uppercase tracking-[0.2em] text-[var(--muted)]">Tenant</label>
                  <select
                    className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px]"
                    value={selectedTenantId}
                    onChange={(event) => setSelectedTenantId(event.target.value)}
                  >
                    <option value="">Select tenant</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.domain || "shared"})
                      </option>
                    ))}
                  </select>
                </div>
                {!selectedTenantId ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4 text-xs text-[var(--muted)]">
                    Pick a tenant from the dropdown to view or toggle feature flags.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {tenantFeatures.map((feature) => (
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
                            onClick={() => toggleTenantFeature(feature.featureKey, feature.enabled)}
                          >
                            {feature.enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {!tenantFeatures.length ? (
                      <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs text-[var(--muted)]">
                        No feature configuration stored for this tenant yet.
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "insights" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">AI Insights</div>
                    <div className="text-xs text-[var(--muted)]">View the latest AI guidance for the tenant.</div>
                  </div>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => (selectedTenantId ? loadTenantInsights(selectedTenantId).catch(captureError) : null)}
                  >
                    Refresh
                  </button>
                </div>
                {!selectedTenantId ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4 text-xs text-[var(--muted)]">
                    Choose a tenant to surface their AI insights.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {tenantInsights.length ? (
                      tenantInsights.map((insight) => (
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
                      <div className="text-[var(--muted)]">
                        No insights yet. Run `npm run ai:insights` after creating failing jobs.
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "scans" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Static Scans</div>
                    <div className="text-xs text-[var(--muted)]">Review the latest static scan reports per tenant.</div>
                  </div>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => (selectedTenantId ? loadTenantScans(selectedTenantId).catch(captureError) : null)}
                  >
                    Refresh
                  </button>
                </div>
                {!selectedTenantId ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4 text-xs text-[var(--muted)]">
                    Pick a tenant to see their static scan history.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 text-xs">
                    <div className="text-[10px] text-[var(--muted)]">Generate a scan with `npm run scan:static`.</div>
                    {tenantScans.length ? (
                      tenantScans.map((scan) => (
                        <div key={scan.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
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
                      <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-[var(--muted)]">
                        No scan history for this tenant yet.
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "docs" ? (
              <section className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Org Documents</div>
                    <div className="text-xs text-[var(--muted)]">AI-generated org design briefs.</div>
                  </div>
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                    onClick={() => (selectedTenantId ? loadTenantDocs(selectedTenantId).catch(captureError) : null)}
                  >
                    Refresh
                  </button>
                </div>
                {!selectedTenantId ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4 text-xs text-[var(--muted)]">
                    Tenant documents require selecting a tenant first.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 text-xs">
                    <div className="text-[10px] text-[var(--muted)]">Run `npm run doc:org` when the tenant changes.</div>
                    {tenantDocs.length ? (
                      tenantDocs.map((doc) => (
                        <div key={doc.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{doc.id}</span>
                            <span className="text-[10px] text-[var(--muted)]">{new Date(doc.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-2 text-[var(--muted)]">{doc.summary || "Generated org design brief."}</p>
                          <div className="mt-2 text-[10px] text-[var(--muted)]">Path: {doc.docPath}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-[var(--muted)]">
                        No documents stored for this tenant.
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
