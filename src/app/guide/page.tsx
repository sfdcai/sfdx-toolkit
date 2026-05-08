"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useState } from "react";

export default function GuidePage() {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [errorHelp, setErrorHelp] = useState<ErrorHelp | null>(null);

  useEffect(() => {
    fetch("/api/guide")
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({ message: "Request failed" }));
          throw new Error(payload.message || payload.error || "Request failed");
        }
        return res.json();
      })
      .then((data) => {
        setHtml(data.html || "");
        setError("");
        setErrorHelp(null);
      })
      .catch((err) => {
        const raw = err instanceof Error ? err.message : "Failed to load user guide.";
        setError(raw);
        setErrorHelp(translateError(err));
      });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Guide</div>
          <div className="text-lg font-semibold text-[var(--ink)]">User Guide</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1" onClick={() => window.location.assign("/docs")}>
              Public Docs
            </button>
            <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1" onClick={() => window.location.assign("/")}>
              Back to App
            </button>
          </div>
        </div>
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {errorHelp ? <ErrorHelpPanel help={errorHelp} /> : null}
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <div className="prose max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
