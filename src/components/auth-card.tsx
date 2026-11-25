"use client";

import { useEffect, useState } from "react";
import { translateError } from "@/lib/error-help";

interface AuthCardProps {
  initialMode?: "login" | "register" | "forgot";
}

export function AuthCard({ initialMode = "login" }: AuthCardProps) {
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "mfa">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallengeToken, setMfaChallengeToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "mint" | "dark" | "sand" | "slate">("light");

  useEffect(() => {
    // If already signed in, go straight to workspace
    const storedToken = localStorage.getItem("token");
    if (storedToken && window.location.pathname !== "/app") {
      window.location.replace("/app");
      return;
    }

    if (typeof window !== "undefined") {
      const mode = new URLSearchParams(window.location.search).get("mode");
      if (mode === "register") {
        setAuthMode("register");
      } else if (mode === "login") {
        setAuthMode("login");
      }
    }

    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = savedTheme === "dark" || savedTheme === "mint" || savedTheme === "sand" || savedTheme === "slate" ? savedTheme : prefersDark ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function handleThemeChange(nextTheme: "light" | "mint" | "dark" | "sand" | "slate") {
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  function persistSession(token: string, user: any) {
    localStorage.setItem("token", token);
    localStorage.setItem(
      "sfdx.session",
      JSON.stringify({
        token,
        user,
        savedAt: new Date().toISOString(),
      })
    );
  }

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !password) {
      setAuthError("Please provide both email and password.");
      return;
    }
    setLoading(true);
    setAuthError("");
    setAuthSuccess("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Authentication failed");
      }
      if (data.mfaRequired) {
        setMfaChallengeToken(data.challengeToken || "");
        setMfaCode("");
        setAuthMode("mfa");
        setLoading(false);
        return;
      }
      persistSession(data.token, data.user);
      window.location.assign("/app");
    } catch (err: any) {
      setAuthError(err.message || "Failed to sign in");
      setLoading(false);
    }
  }

  async function handleRegister(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !password) {
      setAuthError("Please provide both email and password.");
      return;
    }
    setLoading(true);
    setAuthError("");
    setAuthSuccess("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Registration failed");
      }
      persistSession(data.token, data.user);
      window.location.assign("/app");
    } catch (err: any) {
      setAuthError(err.message || "Failed to create account");
      setLoading(false);
    }
  }

  async function handleForgotPassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email) {
      setAuthError("Please provide your account email.");
      return;
    }
    setLoading(true);
    setAuthError("");
    setAuthSuccess("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setAuthSuccess(data.message || "If an account exists, a reset link has been dispatched.");
      setLoading(false);
    } catch (err: any) {
      setAuthError(err.message || "Failed to dispatch reset link");
      setLoading(false);
    }
  }

  async function handleMfaLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!mfaCode) {
      setAuthError("Please enter your 6-digit authenticator code.");
      return;
    }
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: mfaChallengeToken, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "MFA verification failed");
      }
      persistSession(data.token, data.user);
      window.location.assign("/app");
    } catch (err: any) {
      setAuthError(err.message || "MFA code verification failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col justify-between">
      {/* Top Header */}
      <header className="glass sticky top-0 z-20 border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-sky-500 flex items-center justify-center text-slate-950 font-bold text-xs">
              SF
            </div>
            <div>
              <div className="text-base font-semibold leading-tight">SFDX DevOps Platform</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">Manifest · Retrieve · Diff · Deploy</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-full border border-sky-400/50 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-500/40"
              onClick={() => window.location.assign("/")}
              title="Return to the full product tour & feature catalog"
            >
              ← Product Tour & Hub
            </button>
            <select
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs text-[var(--ink)]"
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value as any)}
            >
              <option value="light">⛅ Sky &amp; Slate</option>
              <option value="mint">🌿 Cloud Mint</option>
              <option value="dark">🌙 Twilight Dim</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Auth Form Container */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-2xl space-y-6">
            {/* Mode Tabs */}
            {authMode !== "mfa" && (
              <div className="flex rounded-2xl border border-[var(--line)] p-1 bg-slate-50 dark:bg-slate-900/50">
                <button
                  type="button"
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                    authMode === "login"
                      ? "bg-white text-[var(--accent-strong)] shadow-sm dark:bg-slate-800"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setAuthSuccess("");
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                    authMode === "register"
                      ? "bg-white text-[var(--accent-strong)] shadow-sm dark:bg-slate-800"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError("");
                    setAuthSuccess("");
                  }}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* Title & Subtitle */}
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight">
                {authMode === "login"
                  ? "Sign in to Workspace"
                  : authMode === "register"
                  ? "Create Your Developer Workspace"
                  : authMode === "forgot"
                  ? "Recover Workspace Account"
                  : "Two-Factor Verification"}
              </h2>
              <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">
                {authMode === "login"
                  ? "Access your connected Salesforce orgs, manifests, diffs, and pipelines."
                  : authMode === "register"
                  ? "Deploy metadata with precision. 100% isolated self-service environment."
                  : authMode === "forgot"
                  ? "Enter your email address and we will dispatch a password recovery link."
                  : "Enter the 6-digit TOTP verification code from your mobile authenticator."}
              </p>
            </div>

            {/* Error & Success Alerts */}
            {authError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                {authSuccess}
              </div>
            )}

            {/* Login Form */}
            {authMode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="architect@company.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                      onClick={() => {
                        setAuthMode("forgot");
                        setAuthError("");
                        setAuthSuccess("");
                      }}
                    >
                      Forgot?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="••••••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Sign in to Workspace →"}
                </button>
              </form>
            )}

            {/* Register Form */}
            {authMode === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="developer@company.com"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Password (Min 8 Characters)
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="••••••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 py-3 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50"
                >
                  {loading ? "Creating Workspace..." : "Create Free Account →"}
                </button>
              </form>
            )}

            {/* Forgot Form */}
            {authMode === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Account Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="architect@company.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl border border-[var(--line)] bg-white py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-slate-50 dark:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? "Sending link..." : "Send Reset Link"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                      setAuthSuccess("");
                    }}
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* MFA Form */}
            {authMode === "mfa" && (
              <form onSubmit={handleMfaLogin} className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    6-Digit Authenticator Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-center font-mono text-lg tracking-[0.3em] bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="000000"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify Code & Sign In →"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                    onClick={() => {
                      setAuthMode("login");
                      setMfaChallengeToken("");
                      setMfaCode("");
                      setAuthError("");
                    }}
                  >
                    ← Cancel and Return to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* Footer Notice */}
            <div className="border-t border-[var(--line)] pt-4 text-center">
              <p className="text-[11px] text-[var(--muted)]">
                Enterprise Multi-Tenant Isolation • Scoped Sandbox Protection • RBAC Secured
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--line)] bg-white/50 px-6 py-4 text-center text-xs text-[var(--muted)] dark:bg-slate-950/50">
        SFDX DevOps & IDP Platform • Engineered by Amit Bhardwaj •{" "}
        <a href="/" className="underline hover:text-sky-600">
          DevOps Hub & Documentation
        </a>
      </footer>
    </div>
  );
}
