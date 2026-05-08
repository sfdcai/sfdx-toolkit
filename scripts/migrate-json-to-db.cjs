const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE = process.env.DB_FILE || path.join("data", "app.db");
const JSON_FILE = path.join("data", "db.json");

function ensureDir(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source_org TEXT,
      destination_org TEXT
    );
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      info_json TEXT
    );
    CREATE TABLE IF NOT EXISTS retrievals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      target TEXT NOT NULL,
      log_path TEXT NOT NULL,
      count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      diff_log TEXT NOT NULL,
      changes_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      failed_components_json TEXT NOT NULL,
      manifest_path TEXT NOT NULL,
      deploy_log_path TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function ensureDefaultTenant(db) {
  const existing = db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").get();
  if (existing && existing.id) return existing.id;
  const id = "tenant_default";
  const now = new Date().toISOString();
  db.prepare("INSERT INTO tenants (id, name, domain, plan, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    "Default Tenant",
    "",
    "free",
    now
  );
  return id;
}

function main() {
  const force = process.argv.includes("--force");
  if (!fs.existsSync(JSON_FILE)) {
    console.error(`JSON file not found: ${JSON_FILE}`);
    process.exit(1);
  }
  ensureDir(DB_FILE);
  const db = new Database(DB_FILE);
  migrate(db);

  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount > 0 && !force) {
    console.log("DB already has data. Use --force to re-import from JSON.");
    process.exit(0);
  }

  const tenantId = ensureDefaultTenant(db);
  const raw = fs.readFileSync(JSON_FILE, "utf8");
  const parsed = JSON.parse(raw || "{}");
  const users = parsed.users || [];
  const projects = parsed.projects || [];
  const orgs = parsed.orgs || [];
  const retrievals = parsed.retrievals || [];
  const comparisons = parsed.comparisons || [];
  const deployments = parsed.deployments || [];

  const insertUser = db.prepare(
    "INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, role) VALUES (@id, @tenantId, @email, @passwordHash, @role)"
  );
  const insertProject = db.prepare(
    "INSERT OR REPLACE INTO projects (id, tenant_id, user_id, name, source_org, destination_org) VALUES (@id, @tenantId, @userId, @name, @sourceOrg, @destinationOrg)"
  );
  const insertOrg = db.prepare(
    "INSERT OR REPLACE INTO orgs (id, tenant_id, user_id, alias, info_json) VALUES (@id, @tenantId, @userId, @alias, @infoJson)"
  );
  const insertRetrieval = db.prepare(
    "INSERT OR REPLACE INTO retrievals (id, tenant_id, user_id, project_id, target, log_path, count, created_at) VALUES (@id, @tenantId, @userId, @projectId, @target, @logPath, @count, @createdAt)"
  );
  const insertComparison = db.prepare(
    "INSERT OR REPLACE INTO comparisons (id, tenant_id, user_id, project_id, diff_log, changes_json, created_at) VALUES (@id, @tenantId, @userId, @projectId, @diffLog, @changesJson, @createdAt)"
  );
  const insertDeployment = db.prepare(
    "INSERT OR REPLACE INTO deployments (id, tenant_id, user_id, project_id, status, attempts, failed_components_json, manifest_path, deploy_log_path, output_json, created_at) VALUES (@id, @tenantId, @userId, @projectId, @status, @attempts, @failedComponentsJson, @manifestPath, @deployLogPath, @outputJson, @createdAt)"
  );

  const transaction = db.transaction(() => {
    users.forEach((user) => insertUser.run({ ...user, tenantId }));
    projects.forEach((project) => insertProject.run({ ...project, tenantId }));
    orgs.forEach((org) => insertOrg.run({ ...org, tenantId, infoJson: JSON.stringify(org.info || {}) }));
    retrievals.forEach((item) => insertRetrieval.run({ ...item, tenantId }));
    comparisons.forEach((item) =>
      insertComparison.run({ ...item, tenantId, changesJson: JSON.stringify(item.changes || []) })
    );
    deployments.forEach((item) =>
      insertDeployment.run({
        ...item,
        tenantId,
        failedComponentsJson: JSON.stringify(item.failedComponents || []),
        outputJson: JSON.stringify(item.output || {})
      })
    );
  });
  transaction();

  console.log("Migration complete.");
}

main();
