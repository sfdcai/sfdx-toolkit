"use client";

import { ErrorHelpPanel } from "@/components/error-help-panel";
import { translateError, type ErrorHelp } from "@/lib/error-help";
import { useEffect, useState } from "react";

export default function ReportPage() {
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [errorHelp, setErrorHelp] = useState<ErrorHelp | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [sourceOrg, setSourceOrg] = useState<string>("");
  const [destinationOrg, setDestinationOrg] = useState<string>("");

  function captureError(input: unknown, fallback: string) {
    const raw = input instanceof Error ? input.message : String(input || fallback);
    setError(raw);
    setErrorHelp(translateError(input));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("projectId") || "";
    const relPath = params.get("relPath") || "deploy/logs/comparison-report.html";
    const token = localStorage.getItem("token") || "";
    if (!projectId) {
      captureError("Missing projectId.", "Missing projectId.");
      return;
    }
    if (!token) {
      captureError("Please sign in.", "Please sign in.");
      return;
    }
    fetch("/api/projects", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({ message: "Request failed" }));
          throw new Error(payload.message || payload.error || "Request failed");
        }
        return res.json();
      })
      .then((projects) => {
        const match = Array.isArray(projects) ? projects.find((item) => item.id === projectId) : null;
        if (match) {
          setProjectName(match.name || "");
          setSourceOrg(match.sourceOrg || "");
          setDestinationOrg(match.destinationOrg || "");
        }
      })
      .catch(() => {
        setProjectName("");
        setSourceOrg("");
        setDestinationOrg("");
      });

    fetch(`/api/projects/${projectId}/report?relPath=${encodeURIComponent(relPath)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({ message: "Request failed" }));
          throw new Error(payload.message || payload.error || "Request failed");
        }
        return res.text();
      })
      .then((html) => setContent(html))
      .then(() => {
        setError("");
        setErrorHelp(null);
      })
      .catch((err: any) => captureError(err, "Failed to load report."));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-6 text-sm text-[var(--muted)]">
        <div>{error}</div>
        {errorHelp ? <div className="mt-4 max-w-3xl"><ErrorHelpPanel help={errorHelp} /></div> : null}
      </div>
    );
  }

  if (!content) {
    return <div className="min-h-screen bg-[var(--bg)] p-6 text-sm text-[var(--muted)]">Loading report...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-white/90 px-6 py-4 backdrop-blur">
        <div className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">SFDX DevOps Platform</div>
        <div className="mt-1 text-lg font-semibold text-[var(--ink)]">{projectName || "Project Report"}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1">Source · {sourceOrg || "Not set"}</span>
          <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1">Destination · {destinationOrg || "Not set"}</span>
        </div>
      </div>
      <iframe
        title="Diff report"
        className="h-[calc(100vh-120px)] w-screen border-0"
        sandbox="allow-same-origin allow-popups"
        srcDoc={content}
      />
    </div>
  );
}
