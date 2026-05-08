const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const baseDir = path.join(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  args.forEach((arg) => {
    const [key, value] = arg.split("=");
    options[key.replace(/^--/, "")] = value;
  });
  return options;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function summarizeProjects(projects, orgs) {
  return projects
    .map((project) => {
      const projectOrgs = orgs.filter((org) => org.userId === project.userId);
      const source = project.sourceOrg || "unbound";
      const destination = project.destinationOrg || "unbound";
      return `- **${project.name}** (source: ${source}, destination: ${destination}) – owned by ${project.ownerEmail || "unknown"}`;
    })
    .join("\n");
}

function buildDoc(tenant, projects, orgs, comparisons, deployments) {
  const lines = [
    `# Org Design Document – ${tenant.name}`,
    ``,
    `**Tenant domain:** ${tenant.domain || "n/a"}`,
    `**Plan:** ${tenant.plan}`,
    ``,
    `## Active Projects`,
    projects.length ? summarizeProjects(projects, orgs) : "- None yet",
    ``,
    `## Known Orgs (${orgs.length})`,
    ...orgs.map((org) => `- ${org.alias} (${org.ownerEmail || "unknown"})`),
    ``,
    `## Recent Comparisons`,
    comparisons.length
      ? comparisons.map((comparison) => `- ${comparison.id} (${comparison.diffLog})`).join("\n")
      : "- None recorded",
    ``,
    `## Recent Deployments`,
    deployments.length
      ? deployments.map((deploy) => `- ${deploy.id} (${deploy.status})`).join("\n")
      : "- None recorded",
    ``,
    `Generated on ${new Date().toISOString()}`
  ];
  return lines.join("\n");
}

function main() {
  const options = parseArgs();
  const tenantId = options.tenant || "tenant_default";
  const db = new Database(path.join(baseDir, "data", "app.db"));
  const tenant = db
    .prepare("SELECT id, name, domain, plan FROM tenants WHERE id = ?")
    .get(tenantId) || { id: tenantId, name: "Tenant", domain: "unknown", plan: "free" };
  const projects = db
    .prepare(
      `SELECT p.id, p.name, p.source_org as sourceOrg, p.destination_org as destinationOrg, u.email as ownerEmail, p.user_id as userId
       FROM projects p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.tenant_id = ?`
    )
    .all(tenantId);
  const orgs = db
    .prepare(
      "SELECT o.id, o.alias, o.user_id as userId, u.email as ownerEmail FROM orgs o LEFT JOIN users u ON u.id = o.user_id WHERE o.tenant_id = ?"
    )
    .all(tenantId);
  const comparisons = db
    .prepare("SELECT id, diff_log as diffLog FROM comparisons WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5")
    .all(tenantId);
  const deployments = db
    .prepare("SELECT id, status FROM deployments WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5")
    .all(tenantId);
  const docContent = buildDoc(tenant, projects, orgs, comparisons, deployments);
  const docsDir = path.join(baseDir, "data", "org-docs");
  ensureDir(docsDir);
  const docName = `org-doc-${tenantId}-${Date.now()}.md`;
  const docPath = path.join(docsDir, docName);
  fs.writeFileSync(docPath, docContent);
  db.prepare(
    "INSERT INTO org_design_docs (id, tenant_id, doc_path, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(`doc-${Date.now()}`, tenantId, docPath, "Generated design overview", new Date().toISOString());
  console.log(`Org document generated at ${docPath}`);
}

main();
