const path = require("path");
const Database = require("better-sqlite3");

const heuristics = [
  { match: /INVALID_TYPE/i, message: "Schema mismatch on metadata. Regenerate the manifest with the proper API version and rerun the retrieve before deploying.", severity: "warning" },
  { match: /UNSUPPORTED_OPERATION/i, message: "The target org has a locked config; verify permissions or remove read-only metadata before retrying.", severity: "warning" },
  { match: /INVALID_CROSS_REFERENCE/i, message: "A referenced metadata component is missing in the target org. Run a diff and include the missing dependency.", severity: "error" }
];

function generateInsight(error, jobType) {
  let recommendation = "Check the CLI logs for the failed job and rerun once dependencies are resolved.";
  let severity = "info";
  if (!error) {
    return { summary: `${jobType} failed without an explicit error`, recommendation, severity };
  }
  const match = heuristics.find((rule) => rule.match.test(error));
  if (match) {
    recommendation = match.message;
    severity = match.severity;
  } else if (error.toLowerCase().includes("permission")) {
    recommendation = "Verify that the CLI user has the required permissions and retry.";
    severity = "warning";
  } else if (error.toLowerCase().includes("timeout")) {
    recommendation = "Split the deploy into smaller pieces or increase the CLI timeout.";
    severity = "warning";
  }
  return { summary: error.split("\n")[0], recommendation, severity };
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  args.forEach((arg) => {
    const [key, value] = arg.split("=");
    options[key.replace(/^--/, "")] = value;
  });
  const dbPath = path.join(__dirname, "..", "data", "app.db");
  const db = new Database(dbPath, { readonly: false });
  const tenantId = options.tenant || null;
  const statement = db.prepare(
    `SELECT id, tenant_id, project_id, type, error FROM jobs WHERE status = 'failed' AND error IS NOT NULL ${tenantId ? "AND tenant_id = ?" : ""} ORDER BY created_at DESC LIMIT 25`
  );
  const rows = tenantId ? statement.all(tenantId) : statement.all();
  const insert = db.prepare(
    "INSERT INTO ai_insights (id, tenant_id, job_id, project_id, feature_key, summary, recommendation, raw_error, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const lookup = db.prepare("SELECT id FROM ai_insights WHERE job_id = ? LIMIT 1");
  const now = new Date().toISOString();
  let created = 0;
  rows.forEach((job) => {
    const existing = lookup.get(job.id);
    if (existing) return;
    const insight = generateInsight(job.error, job.type);
    insert.run(
      job.id,
      job.tenant_id,
      job.id,
      job.project_id,
      "ai_insights",
      insight.summary,
      insight.recommendation,
      job.error,
      insight.severity,
      now
    );
    created += 1;
  });
  console.log(`Generated ${created} insights for tenant ${tenantId || "all"}.`);
}

main();
