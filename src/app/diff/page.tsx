"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useMemo, useState } from "react";
import { createTwoFilesPatch } from "diff";

export default function DiffPage() {
  const [diffRenderer, setDiffRenderer] = useState<null | ((patch: string) => string)>(null);
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [errorHelp, setErrorHelp] = useState<ErrorHelp | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fileList, setFileList] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [filterText, setFilterText] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("all");
  const [changesMap, setChangesMap] = useState<Record<string, { status: string }>>({});
  const [serviceDetails, setServiceDetails] = useState<any>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "sand" | "slate">("light");
  const [user, setUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [token, setToken] = useState<string>("");

  async function api(path: string, options: RequestInit = {}) {
    const headers = options.headers ? new Headers(options.headers) : new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(path, { ...options, headers });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ message: "Request failed" }));
      throw new Error(payload.message || payload.error || "Request failed");
    }
    return res.json();
  }

  function captureError(input: unknown, fallback: string) {
    const raw = input instanceof Error ? input.message : String(input || fallback);
    setError(raw);
    setErrorHelp(translateError(input));
  }

  const params = useMemo(() => {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    return {
      projectId: url.searchParams.get("projectId") || "",
      relPath: url.searchParams.get("relPath") || ""
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = saved === "dark" || saved === "sand" || saved === "slate" ? saved : prefersDark ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("token") || "";
    if (stored) {
      let payload = null;
      try {
        payload = JSON.parse(atob(stored.split(".")[1] || ""));
      } catch {
        payload = null;
      }
      if (payload) {
        setUser({ id: payload.id, email: payload.email, role: payload.role });
        setToken(stored);
      }
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        if (!token) return;
        const data = await api("/api/services/status");
        setServiceDetails(data);
      } catch (err: any) {
        setServiceDetails({ error: err.message });
      }
    };
    run();
  }, [token]);

  useEffect(() => {
    const load = async () => {
      if (!params?.projectId || !params?.relPath) return;
      const mod: any = await import("diff2html");
      const diff2html = mod?.Diff2Html || mod?.default || mod;
      if (diff2html?.html) {
        setDiffRenderer(() => (patch: string) =>
          diff2html.html(patch, {
            drawFileList: false,
            matching: "lines",
            outputFormat: "side-by-side"
          })
        );
      }
    };
    load();
  }, [params]);

  useEffect(() => {
    const run = async () => {
      if (!params?.projectId || !params?.relPath) {
        setError("Missing projectId or relPath.");
        setErrorHelp(translateError("Missing projectId or relPath."));
        setLoading(false);
        return;
      }
      try {
        const headers = new Headers();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const [sourceRes, destRes, listRes] = await Promise.all([
          fetch(`/api/projects/${params.projectId}/files?target=source&relPath=${encodeURIComponent(params.relPath)}&allowMissing=true`, {
            headers
          }),
          fetch(`/api/projects/${params.projectId}/files?target=destination&relPath=${encodeURIComponent(params.relPath)}&allowMissing=true`, {
            headers
          }),
          fetch(`/api/projects/${params.projectId}/compare`, { method: "POST", headers })
        ]);
        const source = sourceRes.ok ? await sourceRes.json() : { content: "" };
        const dest = destRes.ok ? await destRes.json() : { content: "" };
        const listPayload = listRes.ok ? await listRes.json() : { changes: [] };
        const files = Array.isArray(listPayload.changes)
          ? listPayload.changes.map((item: any) => item.relPath).filter(Boolean)
          : [];
        const nextMap: Record<string, { status: string }> = {};
        if (Array.isArray(listPayload.changes)) {
          listPayload.changes.forEach((item: any) => {
            if (item.relPath) {
              nextMap[item.relPath] = { status: item.status || "Changed" };
            }
          });
        }
        const nextFiles = files.length ? files : params.relPath ? [params.relPath] : [];
        setFileList(nextFiles);
        setChangesMap(nextMap);
        setActiveFile(params.relPath);
        const patch = createTwoFilesPatch(
          `source/${params.relPath}`,
          `destination/${params.relPath}`,
          source.content || "",
          dest.content || "",
          "",
          ""
        );
        const diffHtml = diffRenderer ? diffRenderer(patch) : "";
        setHtml(diffHtml);
        setError("");
        setErrorHelp(null);
      } catch (err: any) {
        captureError(err, "Failed to load diff.");
      } finally {
        setLoading(false);
      }
    };
    if (diffRenderer && token) run();
  }, [params, diffRenderer, token]);

  async function handleSelectFile(relPath: string) {
    if (!params?.projectId || !relPath) return;
    try {
      setLoading(true);
      setActiveFile(relPath);
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const [sourceRes, destRes] = await Promise.all([
        fetch(`/api/projects/${params.projectId}/files?target=source&relPath=${encodeURIComponent(relPath)}&allowMissing=true`, { headers }),
        fetch(`/api/projects/${params.projectId}/files?target=destination&relPath=${encodeURIComponent(relPath)}&allowMissing=true`, { headers })
      ]);
      const source = sourceRes.ok ? await sourceRes.json() : { content: "" };
      const dest = destRes.ok ? await destRes.json() : { content: "" };
      const patch = createTwoFilesPatch(`source/${relPath}`, `destination/${relPath}`, source.content || "", dest.content || "", "", "");
      const diffHtml = diffRenderer ? diffRenderer(patch) : "";
      setHtml(diffHtml);
      setError("");
      setErrorHelp(null);
    } catch (err: any) {
      captureError(err, "Failed to load diff.");
    } finally {
      setLoading(false);
    }
  }

  function handleThemeChange(next: "light" | "dark" | "sand" | "slate") {
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.dataset.theme = next;
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
    setToken("");
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="glass sticky top-0 z-20 border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="text-lg font-semibold">SFDX DevOps Platform</div>
            <div className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Manifest · Retrieve · Diff · Deploy</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {token && serviceDetails && !serviceDetails.error ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
                  onClick={async () => {
                    try {
                      const data = await api("/api/services/status");
                      setServiceDetails(data);
                    } catch (err: any) {
                      setServiceDetails({ error: err.message });
                    }
                  }}
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
                  >
                    {key}
                  </button>
                ))}
                {serviceDetails?.database?.details ? (
                  <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    {serviceDetails.database.details}
                  </span>
                ) : null}
              </div>
            ) : null}
            <select
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs"
              value={theme}
              onChange={(event) => handleThemeChange(event.target.value as "light" | "dark" | "sand" | "slate")}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="sand">Sand</option>
              <option value="slate">Slate</option>
            </select>
            <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs text-[var(--muted)]">
              {user ? `Signed in: ${user.email}` : "Not signed in"}
            </div>
            <button
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              onClick={() => (window.location.href = "/")}
            >
              Home
            </button>
            {token ? (
              <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={handleLogout}>
                Logout
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <div className="px-6 py-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Diff Viewer</div>
            <div className="text-lg font-semibold text-[var(--ink)]">Side-by-side comparison</div>
          </div>
          {loading ? <div className="text-sm text-[var(--muted)]">Loading diff...</div> : null}
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          {errorHelp ? <ErrorHelpPanel help={errorHelp} /> : null}
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Files</div>
              <div className="mt-3 space-y-2">
                <input
                  className="w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                  placeholder="Filter by name"
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                />
                <select
                  className="w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                  value={filterType}
                  onChange={(event) => setFilterType(event.target.value)}
                >
                  <option value="all">All types</option>
                  {Array.from(new Set(fileList.map((file) => file.split("/")[0]).filter(Boolean))).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 max-h-[70vh] overflow-auto">
                {fileList.length ? (
                  <table className="min-w-full text-xs">
                    <tbody>
                      {fileList
                        .filter((file) => (filterType === "all" ? true : file.startsWith(`${filterType}/`)))
                        .filter((file) => (filterText ? file.toLowerCase().includes(filterText.toLowerCase()) : true))
                        .map((file) => (
                        <tr key={file} className="border-b last:border-b-0">
                          <td className="py-2 pr-2">
                            <button
                              className={`w-full rounded-lg border px-2 py-1 text-left font-mono ${
                                activeFile === file
                                  ? "border-[var(--accent)] bg-white text-[var(--accent-strong)]"
                                  : "border-[var(--line)] hover:border-[var(--accent)]"
                              }`}
                              onClick={() => handleSelectFile(file)}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span>{file}</span>
                                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                                  {(changesMap[file]?.status || "Changed") +
                                    ` · S:${(changesMap[file]?.status || "Changed") === "Removed" ? "No" : "Yes"} D:${
                                      (changesMap[file]?.status || "Changed") === "Added" ? "No" : "Yes"
                                    }`}
                                </span>
                              </div>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-[var(--muted)]">No files available.</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="mb-3 text-xs text-[var(--muted)]">
                Status:{" "}
                {activeFile
                  ? fileList.length
                    ? "Loaded from compare list"
                    : "Single file view"
                  : "Select a file"}
              </div>
              {html ? (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div className="text-xs text-[var(--muted)]">Select a file to view the diff.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
