import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { dataFile, dbFile } from './config';

type DbShape = {
  users: any[];
  projects: any[];
  orgs: any[];
  retrievals: any[];
  comparisons: any[];
  deployments: any[];
};

let dbInstance: Database.Database | null = null;
const DB_ADMIN_ALLOWED_TABLES = new Set([
  'users',
  'projects',
  'orgs',
  'retrievals',
  'comparisons',
  'deployments',
  'jobs',
  'audit_logs',
  'tenants',
  'settings',
  'password_resets',
  'tenant_features',
  'ai_insights',
  'static_scans',
  'org_design_docs',
  'upgrade_requests'
]);

function ensureDir(targetPath: string) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function columnExists(db: Database.Database, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row: any) => row.name === column);
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function syncTenantIdsFromUsers(db: Database.Database) {
  db.prepare(
    'UPDATE projects SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = projects.user_id) WHERE user_id IN (SELECT id FROM users)'
  ).run();
  db.prepare(
    'UPDATE orgs SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = orgs.user_id) WHERE user_id IN (SELECT id FROM users)'
  ).run();
  db.prepare(
    'UPDATE retrievals SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = retrievals.user_id) WHERE user_id IN (SELECT id FROM users)'
  ).run();
  db.prepare(
    'UPDATE comparisons SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = comparisons.user_id) WHERE user_id IN (SELECT id FROM users)'
  ).run();
  db.prepare(
    'UPDATE deployments SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = deployments.user_id) WHERE user_id IN (SELECT id FROM users)'
  ).run();
  db.prepare(
    'UPDATE jobs SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = jobs.user_id) WHERE user_id IN (SELECT id FROM users)'
  ).run();
  db.prepare(
    'UPDATE audit_logs SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = audit_logs.user_id) WHERE user_id IS NOT NULL AND user_id IN (SELECT id FROM users)'
  ).run();
}

function dedupeProjects(db: Database.Database) {
  const duplicates = db
    .prepare(
      `SELECT user_id as userId, name, MIN(id) as keepId
       FROM projects
       GROUP BY user_id, name
       HAVING COUNT(*) > 1`
    )
    .all() as Array<{ userId: string; name: string; keepId: string }>;

  const deleteProjectStmt = db.prepare('DELETE FROM projects WHERE id = ?');
  const updateRetrievals = db.prepare('UPDATE retrievals SET project_id = ? WHERE project_id = ?');
  const updateComparisons = db.prepare('UPDATE comparisons SET project_id = ? WHERE project_id = ?');
  const updateDeployments = db.prepare('UPDATE deployments SET project_id = ? WHERE project_id = ?');
  const updateJobs = db.prepare('UPDATE jobs SET project_id = ? WHERE project_id = ?');

  duplicates.forEach(({ userId, name, keepId }) => {
    const rows = db
      .prepare('SELECT id FROM projects WHERE user_id = ? AND name = ? AND id != ? ORDER BY id ASC')
      .all(userId, name, keepId) as Array<{ id: string }>;

    rows.forEach(({ id }) => {
      updateRetrievals.run(keepId, id);
      updateComparisons.run(keepId, id);
      updateDeployments.run(keepId, id);
      updateJobs.run(keepId, id);
      deleteProjectStmt.run(id);
    });
  });
}

function dedupeOrgs(db: Database.Database) {
  const duplicates = db
    .prepare(
      `SELECT user_id as userId, alias, MIN(id) as keepId
       FROM orgs
       GROUP BY user_id, alias
       HAVING COUNT(*) > 1`
    )
    .all() as Array<{ userId: string; alias: string; keepId: string }>;

  const deleteOrgStmt = db.prepare('DELETE FROM orgs WHERE id = ?');

  duplicates.forEach(({ userId, alias, keepId }) => {
    const rows = db
      .prepare('SELECT id FROM orgs WHERE user_id = ? AND alias = ? AND id != ? ORDER BY id ASC')
      .all(userId, alias, keepId) as Array<{ id: string }>;

    rows.forEach(({ id }) => deleteOrgStmt.run(id));
  });
}

function ensureDefaultTenant(db: Database.Database) {
  const existing = db.prepare('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
  if (existing?.id) return existing.id;
  const id = 'tenant_default';
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO tenants (id, name, domain, plan, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'Default Tenant', '', 'free', now);
  return id;
}

export function getDb() {
  if (dbInstance) return dbInstance;
  ensureDir(dbFile);
  dbInstance = new Database(dbFile);
  dbInstance.pragma('journal_mode = WAL');
  migrate(dbInstance);
  seedFromJson(dbInstance);
  return dbInstance;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      plan TEXT NOT NULL,
      max_users INTEGER,
      max_projects INTEGER,
      max_orgs INTEGER,
      max_storage_bytes INTEGER,
      max_retrieves INTEGER,
      max_deploys INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT,
      company TEXT,
      social_json TEXT,
      created_at TEXT
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
      report_path TEXT,
      report_rel_path TEXT,
      delta_manifest TEXT,
      destructive_manifest TEXT,
      manifest_strategy TEXT,
      source_org TEXT,
      destination_org TEXT,
      job_status_json TEXT,
      snapshot_json TEXT,
      completed_at TEXT,
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
    CREATE TABLE IF NOT EXISTS upgrade_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      requested_plan TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      applied_at TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details_json TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT
    );
    CREATE TABLE IF NOT EXISTS tenant_features (
      tenant_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      settings_json TEXT,
      PRIMARY KEY(tenant_id, feature_key)
    );
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      job_id TEXT,
      project_id TEXT,
      feature_key TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      raw_error TEXT,
      severity TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS static_scans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      status TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      report_path TEXT,
      summary TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS org_design_docs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT,
      doc_path TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant ON tenant_features(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant ON ai_insights(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_static_scans_tenant ON static_scans(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_org_design_docs_tenant ON org_design_docs(tenant_id)');

  ensureColumn(db, 'users', 'tenant_id', 'TEXT');
  ensureColumn(db, 'users', 'name', 'TEXT');
  ensureColumn(db, 'users', 'company', 'TEXT');
  ensureColumn(db, 'users', 'social_json', 'TEXT');
  ensureColumn(db, 'users', 'mfa_secret', 'TEXT');
  ensureColumn(db, 'users', 'mfa_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'created_at', 'TEXT');
  ensureColumn(db, 'projects', 'tenant_id', 'TEXT');
  ensureColumn(db, 'orgs', 'tenant_id', 'TEXT');
  ensureColumn(db, 'retrievals', 'tenant_id', 'TEXT');
  ensureColumn(db, 'comparisons', 'tenant_id', 'TEXT');
  ensureColumn(db, 'deployments', 'tenant_id', 'TEXT');
  ensureColumn(db, 'comparisons', 'report_path', 'TEXT');
  ensureColumn(db, 'comparisons', 'report_rel_path', 'TEXT');
  ensureColumn(db, 'comparisons', 'delta_manifest', 'TEXT');
  ensureColumn(db, 'comparisons', 'destructive_manifest', 'TEXT');
  ensureColumn(db, 'comparisons', 'manifest_strategy', 'TEXT');
  ensureColumn(db, 'comparisons', 'source_org', 'TEXT');
  ensureColumn(db, 'comparisons', 'destination_org', 'TEXT');
  ensureColumn(db, 'comparisons', 'job_status_json', 'TEXT');
  ensureColumn(db, 'comparisons', 'snapshot_json', 'TEXT');
  ensureColumn(db, 'comparisons', 'completed_at', 'TEXT');
  ensureColumn(db, 'tenants', 'max_users', 'INTEGER');
  ensureColumn(db, 'tenants', 'max_projects', 'INTEGER');
  ensureColumn(db, 'tenants', 'max_orgs', 'INTEGER');
  ensureColumn(db, 'tenants', 'max_storage_bytes', 'INTEGER');
  ensureColumn(db, 'tenants', 'max_retrieves', 'INTEGER');
  ensureColumn(db, 'tenants', 'max_deploys', 'INTEGER');
  ensureColumn(db, 'jobs', 'tenant_id', 'TEXT');
  ensureColumn(db, 'jobs', 'user_id', 'TEXT');
  ensureColumn(db, 'jobs', 'project_id', 'TEXT');
  ensureColumn(db, 'jobs', 'type', 'TEXT');
  ensureColumn(db, 'jobs', 'status', 'TEXT');
  ensureColumn(db, 'jobs', 'payload_json', 'TEXT');
  ensureColumn(db, 'jobs', 'attempts', 'INTEGER');
  ensureColumn(db, 'jobs', 'created_at', 'TEXT');
  ensureColumn(db, 'jobs', 'started_at', 'TEXT');
  ensureColumn(db, 'jobs', 'completed_at', 'TEXT');
  ensureColumn(db, 'jobs', 'updated_at', 'TEXT');
  ensureColumn(db, 'jobs', 'error', 'TEXT');
  ensureColumn(db, 'audit_logs', 'tenant_id', 'TEXT');
  ensureColumn(db, 'audit_logs', 'user_id', 'TEXT');
  ensureColumn(db, 'audit_logs', 'action', 'TEXT');
  ensureColumn(db, 'audit_logs', 'target_type', 'TEXT');
  ensureColumn(db, 'audit_logs', 'target_id', 'TEXT');
  ensureColumn(db, 'audit_logs', 'details_json', 'TEXT');
  ensureColumn(db, 'audit_logs', 'ip', 'TEXT');
  ensureColumn(db, 'audit_logs', 'user_agent', 'TEXT');
  ensureColumn(db, 'audit_logs', 'created_at', 'TEXT');
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get('upgrade_requests')) {
    ensureColumn(db, 'upgrade_requests', 'resolved_at', 'TEXT');
    ensureColumn(db, 'upgrade_requests', 'applied_at', 'TEXT');
  }

  const tenantId = ensureDefaultTenant(db);
  db.prepare('UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  db.prepare('UPDATE projects SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  db.prepare('UPDATE orgs SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  db.prepare('UPDATE retrievals SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  db.prepare('UPDATE comparisons SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  db.prepare('UPDATE deployments SET tenant_id = ? WHERE tenant_id IS NULL').run(tenantId);
  db.prepare('UPDATE users SET role = ? WHERE role = ?').run('super_admin', 'admin');
  syncTenantIdsFromUsers(db);
  dedupeProjects(db);
  dedupeOrgs(db);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_name ON projects(user_id, name)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_user_alias ON orgs(user_id, alias)');
}

function seedFromJson(db: Database.Database) {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count as number;
  if (userCount > 0) return;
  if (!fs.existsSync(dataFile)) return;
  const tenantId = ensureDefaultTenant(db);
  const raw = fs.readFileSync(dataFile, 'utf8');
  const parsed = (JSON.parse(raw || '{}') || {}) as DbShape;
  const users = parsed.users || [];
  const projects = parsed.projects || [];
  const orgs = parsed.orgs || [];
  const retrievals = parsed.retrievals || [];
  const comparisons = parsed.comparisons || [];
  const deployments = parsed.deployments || [];

  const insertUser = db.prepare(
    'INSERT INTO users (id, tenant_id, email, password_hash, role) VALUES (@id, @tenantId, @email, @passwordHash, @role)'
  );
  const insertProject = db.prepare(
    'INSERT INTO projects (id, tenant_id, user_id, name, source_org, destination_org) VALUES (@id, @tenantId, @userId, @name, @sourceOrg, @destinationOrg)'
  );
  const insertOrg = db.prepare(
    'INSERT INTO orgs (id, tenant_id, user_id, alias, info_json) VALUES (@id, @tenantId, @userId, @alias, @infoJson)'
  );
  const insertRetrieval = db.prepare(
    'INSERT INTO retrievals (id, tenant_id, user_id, project_id, target, log_path, count, created_at) VALUES (@id, @tenantId, @userId, @projectId, @target, @logPath, @count, @createdAt)'
  );
  const insertComparison = db.prepare(
    `INSERT INTO comparisons (
      id,
      tenant_id,
      user_id,
      project_id,
      diff_log,
      report_path,
      report_rel_path,
      delta_manifest,
      destructive_manifest,
      manifest_strategy,
      source_org,
      destination_org,
      job_status_json,
      snapshot_json,
      completed_at,
      changes_json,
      created_at
    ) VALUES (
      @id,
      @tenantId,
      @userId,
      @projectId,
      @diffLog,
      @reportPath,
      @reportRelPath,
      @deltaManifest,
      @destructiveManifest,
      @manifestStrategy,
      @sourceOrg,
      @destinationOrg,
      @jobStatusJson,
      @snapshotJson,
      @completedAt,
      @changesJson,
      @createdAt
    )`
  );
  const insertDeployment = db.prepare(
    'INSERT INTO deployments (id, tenant_id, user_id, project_id, status, attempts, failed_components_json, manifest_path, deploy_log_path, output_json, created_at) VALUES (@id, @tenantId, @userId, @projectId, @status, @attempts, @failedComponentsJson, @manifestPath, @deployLogPath, @outputJson, @createdAt)'
  );

  const transaction = db.transaction(() => {
    users.forEach((user) => insertUser.run({ ...user, tenantId }));
    projects.forEach((project) => insertProject.run({ ...project, tenantId }));
    orgs.forEach((org) => insertOrg.run({ ...org, tenantId, infoJson: JSON.stringify(org.info || {}) }));
    retrievals.forEach((item) => insertRetrieval.run({ ...item, tenantId }));
    comparisons.forEach((item) =>
      insertComparison.run({
        ...item,
        tenantId,
        reportPath: item.reportPath || null,
        reportRelPath: item.reportRelPath || null,
        deltaManifest: item.deltaManifest || null,
        destructiveManifest: item.destructiveManifest || null,
        manifestStrategy: item.manifestStrategy || null,
        sourceOrg: item.sourceOrg || null,
        destinationOrg: item.destinationOrg || null,
        jobStatusJson: item.jobStatusJson || null,
        snapshotJson: item.snapshotJson || null,
        completedAt: item.completedAt || null,
        changesJson: JSON.stringify(item.changes || [])
      })
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
}

export function dbStats() {
  const db = getDb();
  return {
    users: db.prepare('SELECT COUNT(*) as count FROM users').get().count as number,
    projects: db.prepare('SELECT COUNT(*) as count FROM projects').get().count as number,
    orgs: db.prepare('SELECT COUNT(*) as count FROM orgs').get().count as number,
    retrievals: db.prepare('SELECT COUNT(*) as count FROM retrievals').get().count as number,
    comparisons: db.prepare('SELECT COUNT(*) as count FROM comparisons').get().count as number,
    deployments: db.prepare('SELECT COUNT(*) as count FROM deployments').get().count as number
  };
}

export function listTables() {
  const db = getDb();
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row: { name: string }) => row.name as string)
    .filter((name: string) => DB_ADMIN_ALLOWED_TABLES.has(name));
}

function ensureAllowedAdminTable(name: string) {
  const normalized = String(name || '').trim();
  if (!DB_ADMIN_ALLOWED_TABLES.has(normalized)) {
    throw new Error('Invalid table');
  }
  return normalized;
}

export function tableRows(name: string, limit = 50, offset = 0) {
  const tableName = ensureAllowedAdminTable(name);
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit) || 50));
  const safeOffset = Math.max(0, Math.trunc(offset) || 0);
  const rows = db.prepare(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`).all(safeLimit, safeOffset);
  return rows;
}

export function tableInfo(name: string) {
  const tableName = ensureAllowedAdminTable(name);
  const db = getDb();
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

export function insertRow(name: string, data: Record<string, unknown>) {
  const tableName = ensureAllowedAdminTable(name);
  const db = getDb();
  const keys = Object.keys(data);
  if (!keys.length) return;
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
  const values = keys.map((key) => data[key]);
  db.prepare(sql).run(...values);
}

export function updateRow(name: string, id: string, data: Record<string, unknown>) {
  const tableName = ensureAllowedAdminTable(name);
  const db = getDb();
  const keys = Object.keys(data).filter((key) => key !== 'id');
  if (!keys.length) return;
  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => data[key]);
  db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`).run(...values, id);
}

export function deleteRow(name: string, id: string) {
  const tableName = ensureAllowedAdminTable(name);
  const db = getDb();
  db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
}
