const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const baseDir = path.join(__dirname, "..");
const repoDirs = ["src", "scripts"];

const rules = [
  { key: "todo-comment", regex: /TODO|FIXME/, severity: "info", message: "Reminder comment left in code" },
  { key: "console-log", regex: /console\\.log\\(/, severity: "warning", message: "Console logging found in production code" },
  { key: "debugger", regex: /debugger;/, severity: "warning", message: "Debugger statement might break production runs" },
  { key: "eval", regex: /eval\\(/, severity: "error", message: "Use of eval() is risky" }
];

function walk(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(next, callback);
    } else if (entry.isFile()) {
      const supported = /\.(ts|tsx|js|mjs)$/i;
      if (supported.test(entry.name)) {
        callback(next);
      }
    }
  });
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const findings = [];
  lines.forEach((line, index) => {
    rules.forEach((rule) => {
      if (rule.regex.test(line)) {
        findings.push({
          file: path.relative(baseDir, filePath),
          line: index + 1,
          severity: rule.severity,
          rule: rule.key,
          message: rule.message
        });
      }
    });
  });
  return findings;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  args.forEach((arg) => {
    const [key, value] = arg.split("=");
    options[key.replace(/^--/, "")] = value;
  });
  return options;
}

function main() {
  const options = parseArgs();
  const tenantId = options.tenant || "tenant_default";
  const userId = options.user || null;
  const scanId = `scan-${Date.now()}`;
  const findings = [];
  repoDirs.forEach((dirName) => {
    const dirPath = path.join(baseDir, dirName);
    if (!fs.existsSync(dirPath)) return;
    walk(dirPath, (filePath) => {
      findings.push(...scanFile(filePath));
    });
  });
  const summary = `Found ${findings.length} findings across ${repoDirs.length} directories.`;
  const reportDir = path.join(baseDir, "data", "static-scans");
  ensureDir(reportDir);
  const reportPath = path.join(reportDir, `${scanId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ id: scanId, summary, findings }, null, 2));
  const db = new Database(path.join(baseDir, "data", "app.db"));
  db.prepare(
    "INSERT INTO static_scans (id, tenant_id, user_id, status, findings_json, report_path, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(scanId, tenantId, userId, "done", JSON.stringify(findings), reportPath, summary, new Date().toISOString());
  console.log(`Static scan ${scanId} completed for tenant ${tenantId}. Report at ${reportPath}`);
}

main();
