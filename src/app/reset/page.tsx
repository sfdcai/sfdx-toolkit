"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResetForm() {
  const params = useSearchParams();
  const tokenParam = params.get("token") || "";
  const [token, setToken] = useState<string>(tokenParam);
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function handleReset() {
    setMessage("");
    setError("");
    if (!token) {
      setError("Reset token is required.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload.message || payload.error || "Reset failed.");
      return;
    }
    setMessage(payload.message || "Password reset successfully.");
    setPassword("");
    setConfirm("");
  }

  return (
    <section className="w-full rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-[var(--card-shadow)]">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Enter the reset token and choose a new password.</p>
      <div className="mt-4 flex flex-col gap-3">
        <input
          className="w-full rounded-2xl border border-[var(--line)] px-4 py-3"
          placeholder="Reset token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <input
          className="w-full rounded-2xl border border-[var(--line)] px-4 py-3"
          placeholder="New password (min 8)"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <input
          className="w-full rounded-2xl border border-[var(--line)] px-4 py-3"
          placeholder="Confirm new password"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <button className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold" onClick={handleReset}>
          Reset password
        </button>
        {message ? <div className="text-xs text-emerald-600">{message}</div> : null}
        {error ? <div className="text-xs text-rose-600">{error}</div> : null}
      </div>
    </section>
  );
}

export default function ResetPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
      <Suspense fallback={<div className="text-sm text-[var(--muted)]">Loading...</div>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
