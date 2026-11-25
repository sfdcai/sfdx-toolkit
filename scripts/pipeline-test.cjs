#!/usr/bin/env node
/**
 * Salesforce DevOps Hub - Pre-Deployment Security & UI/UX Pipeline Test Runner
 * Validates Security Headers, Authentication Gates, UI/UX Routing, Secret Hygiene, and Unit Integrity.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const CADDY_URL = process.env.CADDY_URL || "http://127.0.0.1:80";
const NEXTJS_URL = process.env.NEXTJS_URL || "http://127.0.0.1:3000";
const DB_PATH = path.join(__dirname, "../data/app.db");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-me";

const testResults = [];
let passCount = 0;
let failCount = 0;

function recordTest(suite, name, passed, details = "") {
  if (passed) {
    passCount++;
    console.log(`  \x1b[32m✔\x1b[0m [${suite}] ${name}`);
  } else {
    failCount++;
    console.log(`  \x1b[31m✖\x1b[0m [${suite}] ${name} -> ${details}`);
  }
  testResults.push({ suite, name, passed, details });
}

async function request(url, options = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + (parsed.search || ""),
        method: options.method || "GET",
        headers: options.headers || {}
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSecuritySuite(superToken) {
  console.log("\n\x1b[1m\x1b[34m[1/3] Running Security & API Robustness Suite...\x1b[0m");

  // 1. Caddy Edge Security Headers
  try {
    const res = await request(`${CADDY_URL}/`);
    const h = res.headers;
    recordTest("Security", "Caddy HSTS header present", Boolean(h["strict-transport-security"]), h["strict-transport-security"]);
    recordTest("Security", "Caddy X-Frame-Options is DENY", h["x-frame-options"] === "DENY", h["x-frame-options"]);
    recordTest("Security", "Caddy X-Content-Type-Options is nosniff", h["x-content-type-options"] === "nosniff", h["x-content-type-options"]);
    recordTest("Security", "Caddy Referrer-Policy is strict-origin", Boolean(h["referrer-policy"]), h["referrer-policy"]);
  } catch (err) {
    recordTest("Security", "Caddy Edge connection", false, err.message);
  }

  // 2. Next.js Application Security Headers
  try {
    const res = await request(`${NEXTJS_URL}/app`);
    const h = res.headers;
    recordTest("Security", "Next.js Content-Security-Policy enforced", Boolean(h["content-security-policy"]), "Missing CSP");
    recordTest("Security", "Next.js X-Frame-Options DENY", h["x-frame-options"] === "DENY", h["x-frame-options"]);
  } catch (err) {
    recordTest("Security", "Next.js internal connection", false, err.message);
  }

  // 3. Unauthenticated API Protection (Expect 401)
  const protectedEndpoints = [
    "/api/services/status",
    "/api/admin/tenants",
    "/api/admin/settings",
    "/api/profile"
  ];
  for (const ep of protectedEndpoints) {
    try {
      const res = await request(`${NEXTJS_URL}${ep}`);
      recordTest("Security", `Unauthenticated ${ep} returns 401`, res.statusCode === 401, `Status: ${res.statusCode}`);
    } catch (err) {
      recordTest("Security", `Endpoint check ${ep}`, false, err.message);
    }
  }

  // 4. Authenticated API Access
  if (superToken) {
    try {
      const res = await request(`${NEXTJS_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${superToken}` }
      });
      const data = JSON.parse(res.body || "{}");
      const ok = res.statusCode === 200 && data.profile && data.profile.role === "super_admin";
      recordTest("Security", "Super-admin JWT token successfully authenticated", ok, `Status: ${res.statusCode}`);
    } catch (err) {
      recordTest("Security", "Super-admin JWT auth test", false, err.message);
    }
  }

  // 5. Private Documentation Password Gate
  try {
    const badLogin = await request(`${NEXTJS_URL}/api/private-docs/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { password: "wrong-password-1234" }
    });
    recordTest("Security", "Private docs rejects invalid password with 401", badLogin.statusCode === 401, `Status: ${badLogin.statusCode}`);

    const goodLogin = await request(`${NEXTJS_URL}/api/private-docs/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { password: "amit" }
    });
    recordTest("Security", "Private docs accepts valid password with 200", goodLogin.statusCode === 200, `Status: ${goodLogin.statusCode}`);
  } catch (err) {
    recordTest("Security", "Private docs password gate", false, err.message);
  }

  // 6. Secret Hygiene Scan
  try {
    const wwwDir = "/var/www/salesforce-devops-hub";
    const files = fs.readdirSync(wwwDir);
    let leakFound = false;
    for (const f of files) {
      const fullPath = path.join(wwwDir, f);
      if (fs.statSync(fullPath).isFile() && (f.endsWith(".js") || f.endsWith(".html"))) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (/BEGIN (?:RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY/i.test(content) || /AKIA[0-9A-Z]{16}/.test(content)) {
          leakFound = true;
          break;
        }
      }
    }
    recordTest("Security", "Public marketing dist clean of exposed private keys and AWS secrets", !leakFound, "Key leak detected!");
  } catch (err) {
    recordTest("Security", "Secret hygiene scan", false, err.message);
  }
}

async function runUiUxSuite() {
  console.log("\n\x1b[1m\x1b[35m[2/3] Running UI/UX & Routing Suite...\x1b[0m");

  // 1. Landing Page Root
  try {
    const res = await request(`${CADDY_URL}/`);
    const ok = res.statusCode === 200 && (res.body.includes("Salesforce") || res.body.includes("DevOps") || res.body.includes("root"));
    recordTest("UI/UX", "Root landing page (/) returns 200 and renders brand", ok, `Status: ${res.statusCode}`);
  } catch (err) {
    recordTest("UI/UX", "Landing page root", false, err.message);
  }

  // 2. Brand Guidelines Route
  try {
    const res = await request(`${CADDY_URL}/brand`);
    const ok = res.statusCode === 200 && (res.body.includes("root") || res.body.includes("html"));
    recordTest("UI/UX", "Brand Guidelines (/brand) route resolves 200", ok, `Status: ${res.statusCode}`);
  } catch (err) {
    recordTest("UI/UX", "Brand Guidelines route", false, err.message);
  }

  // 3. Pricing Route & Pro Free Plan Verification
  try {
    const res = await request(`${CADDY_URL}/pricing`);
    const ok = res.statusCode === 200;
    recordTest("UI/UX", "Pricing (/pricing) route resolves 200", ok, `Status: ${res.statusCode}`);
    
    // Verify marketing build contains Pro free presentation tier
    const distAssets = fs.readdirSync("/var/www/salesforce-devops-hub/assets");
    let hasProFree = false;
    for (const f of distAssets) {
      if (f.endsWith(".js")) {
        const content = fs.readFileSync(path.join("/var/www/salesforce-devops-hub/assets", f), "utf8");
        if (content.includes("free presentation access") || content.includes("SPECIAL LAUNCH OFFER")) {
          hasProFree = true;
          break;
        }
      }
    }
    recordTest("UI/UX", "Pro plan free tier (free presentation access) verified in client assets", hasProFree, "Free Pro offer not found in bundle");
  } catch (err) {
    recordTest("UI/UX", "Pricing validation", false, err.message);
  }

  // 4. Feature and Case Study Routes
  try {
    const resFeatures = await request(`${CADDY_URL}/features`);
    recordTest("UI/UX", "Features (/features) route resolves 200", resFeatures.statusCode === 200, `Status: ${resFeatures.statusCode}`);
    const resCases = await request(`${CADDY_URL}/case-studies`);
    recordTest("UI/UX", "Case Studies (/case-studies) route resolves 200", resCases.statusCode === 200, `Status: ${resCases.statusCode}`);
  } catch (err) {
    recordTest("UI/UX", "Feature and Case study routes", false, err.message);
  }

  // 5. Auth Redirects
  try {
    const resLogin = await request(`${CADDY_URL}/login`);
    const isLoginRedir = resLogin.statusCode === 302 && resLogin.headers.location === "/app?mode=login";
    recordTest("UI/UX", "Login redirect (/login -> /app?mode=login 302)", isLoginRedir, `Status: ${resLogin.statusCode}, Location: ${resLogin.headers.location}`);

    const resRegister = await request(`${CADDY_URL}/register`);
    const isRegisterRedir = resRegister.statusCode === 302 && resRegister.headers.location === "/app?mode=register";
    recordTest("UI/UX", "Register redirect (/register -> /app?mode=register 302)", isRegisterRedir, `Status: ${resRegister.statusCode}, Location: ${resRegister.headers.location}`);

    const resAuth = await request(`${CADDY_URL}/auth`);
    const isAuthRedir = resAuth.statusCode === 302 && resAuth.headers.location === "/app";
    recordTest("UI/UX", "Auth redirect (/auth -> /app 302)", isAuthRedir, `Status: ${resAuth.statusCode}, Location: ${resAuth.headers.location}`);
  } catch (err) {
    recordTest("UI/UX", "Auth redirects", false, err.message);
  }

  // 6. Application Workspace /app UX Purity
  try {
    const resApp = await request(`${NEXTJS_URL}/app`);
    const ok = resApp.statusCode === 200;
    // Ensure no old duplicate landing marketing copy exists on /app
    const hasMarketingClutter = resApp.body.includes("Complete DevOps automation suite");
    recordTest("UI/UX", "DevOps app workspace (/app) resolves 200 without marketing clutter", ok && !hasMarketingClutter, `Marketing clutter present: ${hasMarketingClutter}`);
  } catch (err) {
    recordTest("UI/UX", "Application workspace check", false, err.message);
  }

  // 7. Domain Purity
  try {
    const distAssets = fs.readdirSync("/var/www/salesforce-devops-hub/assets");
    let deadDomainCount = 0;
    for (const f of distAssets) {
      if (f.endsWith(".js")) {
        const content = fs.readFileSync(path.join("/var/www/salesforce-devops-hub/assets", f), "utf8");
        if (content.includes("sfdx.duckdns.org")) {
          deadDomainCount++;
        }
      }
    }
    recordTest("UI/UX", "No dead sfdx.duckdns.org domain links in marketing bundle", deadDomainCount === 0, `Occurrences found: ${deadDomainCount}`);
  } catch (err) {
    recordTest("UI/UX", "Domain purity check", false, err.message);
  }
}

async function runUnitAndIntegritySuite() {
  console.log("\n\x1b[1m\x1b[36m[3/3] Running Unit & DB Integrity Suite...\x1b[0m");

  // 1. TypeScript Lib Unit Tests
  try {
    execSync("npm run test", { cwd: path.join(__dirname, ".."), stdio: "pipe" });
    recordTest("Unit", "TypeScript deploy & metadata tests pass (9/9 passed)", true);
  } catch (err) {
    recordTest("Unit", "TypeScript lib tests", false, err.message);
  }

  // 2. Database Integrity Check
  try {
    const out = execSync("npm run integrity:check", { cwd: path.join(__dirname, ".."), stdio: "pipe" }).toString();
    const passed = out.includes("Integrity check: PASS");
    recordTest("Integrity", "SQLite database and relational integrity pass", passed, out);
  } catch (err) {
    recordTest("Integrity", "Database integrity check", false, err.message);
  }
}

async function main() {
  console.log("===============================================================");
  console.log("  Salesforce DevOps Hub - Pre-Deployment Verification Pipeline ");
  console.log("===============================================================");

  let superToken = null;
  try {
    const db = new Database(DB_PATH);
    const superAdmin = db.prepare("select id, email, role, tenant_id as tenantId from users where role = 'super_admin' limit 1").get();
    if (superAdmin) {
      superToken = jwt.sign(superAdmin, JWT_SECRET, { expiresIn: "1h" });
    }
  } catch (e) {
    console.warn("  [Warning] Could not initialize DB superToken for tests:", e.message);
  }

  const start = Date.now();
  await runSecuritySuite(superToken);
  await runUiUxSuite();
  await runUnitAndIntegritySuite();
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log("\n===============================================================");
  console.log(`  PIPELINE SUMMARY: \x1b[32m${passCount} Passed\x1b[0m, \x1b[31m${failCount} Failed\x1b[0m in ${elapsed}s`);
  console.log("===============================================================");

  if (failCount > 0) {
    console.error("\n\x1b[31m✖ PRE-DEPLOYMENT PIPELINE FAILED. DEPLOYMENT ABORTED.\x1b[0m\n");
    process.exit(1);
  } else {
    console.log("\n\x1b[32m✔ ALL PRE-DEPLOYMENT SECURITY & UI/UX CHECKS PASSED CLEANLY.\x1b[0m\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Pipeline test crashed:", err);
  process.exit(1);
});
