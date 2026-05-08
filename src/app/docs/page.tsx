"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useState } from "react";

export default function DocsPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [errorHelp, setErrorHelp] = useState<ErrorHelp | null>(null);
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
        const res = await api("/api/docs/list");
        setFiles(res.files || []);
        if (res.files?.length) {
          setActive(res.files[0]);
        }
        setError("");
        setErrorHelp(null);
      } catch (err: any) {
        captureError(err, "Failed to load docs.");
      }
    };
    run();
  }, [token]);

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
    const run = async () => {
      if (!active) return;
      try {
        const data = await api(`/api/docs/file?name=${encodeURIComponent(active)}`);
        setHtml(data.html || "");
        setError("");
        setErrorHelp(null);
      } catch (err: any) {
        captureError(err, "Failed to load document.");
      }
    };
    run();
  }, [active, token]);

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
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Docs</div>
            <div className="text-lg font-semibold text-[var(--ink)]">Public documentation</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1"
                onClick={() => window.location.assign("/guide")}
              >
                Open User Guide
              </button>
              <button
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1"
                onClick={() => window.location.assign("/private-docs")}
              >
                Private Docs
              </button>
            </div>
          </div>
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          {errorHelp ? <ErrorHelpPanel help={errorHelp} /> : null}
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Files</div>
              <div className="mt-3 space-y-2">
                {files.length ? (
                  files.map((file) => (
                    <button
                      key={file}
                      className={`w-full rounded-lg border px-2 py-1 text-left text-xs ${
                        active === file ? "border-[var(--accent)] text-[var(--accent-strong)]" : "border-[var(--line)]"
                      }`}
                      onClick={() => setActive(file)}
                    >
                      {file}
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-[var(--muted)]">No docs available.</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="prose max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
