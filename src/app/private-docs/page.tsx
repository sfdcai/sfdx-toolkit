"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useState } from "react";

export default function PrivateDocsPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [errorHelp, setErrorHelp] = useState<ErrorHelp | null>(null);

  async function api(path: string, options: RequestInit = {}) {
    const headers = options.headers ? new Headers(options.headers) : new Headers();
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(path, { ...options, headers, credentials: "include" });
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

  async function loadFiles() {
    const res = await api("/api/private-docs/list");
    setFiles(res.files || []);
    if (res.files?.length) {
      setActive((current) => (current && res.files.includes(current) ? current : res.files[0]));
    }
    setUnlocked(true);
    setError("");
    setErrorHelp(null);
  }

  useEffect(() => {
    loadFiles().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!unlocked || !active) return;
    api(`/api/private-docs/file?name=${encodeURIComponent(active)}`)
      .then((data) => {
        setHtml(data.html || "");
        setError("");
        setErrorHelp(null);
      })
      .catch((err) => captureError(err, "Failed to load private document."));
  }, [active, unlocked]);

  async function handleUnlock() {
    try {
      await api("/api/private-docs/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      setPassword("");
      await loadFiles();
    } catch (err) {
      captureError(err, "Private docs unlock failed.");
    }
  }

  async function handleLock() {
    try {
      await api("/api/private-docs/logout", { method: "POST" });
    } finally {
      setUnlocked(false);
      setFiles([]);
      setActive("");
      setHtml("");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Private Docs</div>
          <div className="text-lg font-semibold text-[var(--ink)]">Restricted operator notes</div>
        </div>
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {errorHelp ? <ErrorHelpPanel help={errorHelp} /> : null}
        {!unlocked ? (
          <div className="max-w-md rounded-2xl border border-[var(--line)] bg-white p-4">
            <div className="text-sm font-semibold">Unlock private docs</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Enter the private docs password configured on the server.</div>
            <input
              type="password"
              className="mt-4 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Private docs password"
            />
            <div className="mt-4 flex gap-2">
              <button className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs text-white" onClick={handleUnlock}>
                Unlock
              </button>
              <button className="rounded-full border border-[var(--line)] px-4 py-2 text-xs" onClick={() => window.location.assign("/docs")}>
                Back to Public Docs
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1" onClick={() => window.location.assign("/docs")}>
                Public Docs
              </button>
              <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1" onClick={() => window.location.assign("/guide")}>
                User Guide
              </button>
              <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1" onClick={handleLock}>
                Lock
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
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
                    <div className="text-xs text-[var(--muted)]">No private docs available.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <div className="prose max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
