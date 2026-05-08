#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function parseArgs(argv) {
  return {
    fix: argv.includes('--fix'),
    json: argv.includes('--json'),
    db: 'data/app.db',
    root: 'userdata'
  };
}

function addFinding(store, severity, code, message, meta = {}) {
  store.push({ severity, code, message, meta });
}

function syncTenantIds(db) {
  db.exec(`
    UPDATE projects SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = projects.user_id) WHERE user_id IN (SELECT id FROM users);
    UPDATE orgs SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = orgs.user_id) WHERE user_id IN (SELECT id FROM users);
    UPDATE retrievals SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = retrievals.user_id) WHERE user_id IN (SELECT id FROM users);
    UPDATE comparisons SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = comparisons.user_id) WHERE user_id IN (SELECT id FROM users);
    UPDATE deployments SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = deployments.user_id) WHERE user_id IN (SELECT id FROM users);
    UPDATE jobs SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = jobs.user_id) WHERE user_id IN (SELECT id FROM users);
    UPDATE audit_logs SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = audit_logs.user_id) WHERE user_id IS NOT NULL AND user_id IN (SELECT id FROM users);
  `);
}

function dedupeProjects(db) {
  const duplicates = db.prepare(`
    SELECT user_id as userId, name, MIN(id) as keepId
    FROM projects
    GROUP BY user_id, name
    HAVING COUNT(*) > 1
  `).all();

  const updateRetrievals = db.prepare('UPDATE retrievals SET project_id = ? WHERE project_id = ?');
  const updateComparisons = db.prepare('UPDATE comparisons SET project_id = ? WHERE project_id = ?');
  const updateDeployments = db.prepare('UPDATE deployments SET project_id = ? WHERE project_id = ?');
  const updateJobs = db.prepare('UPDATE jobs SET project_id = ? WHERE project_id = ?');
  const deleteProject = db.prepare('DELETE FROM projects WHERE id = ?');

  duplicates.forEach((row) => {
    const stale = db.prepare(
      'SELECT id FROM projects WHERE user_id = ? AND name = ? AND id != ? ORDER BY id ASC'
    ).all(row.userId, row.name, row.keepId);
    stale.forEach((item) => {
      updateRetrievals.run(row.keepId, item.id);
      updateComparisons.run(row.keepId, item.id);
      updateDeployments.run(row.keepId, item.id);
      updateJobs.run(row.keepId, item.id);
      deleteProject.run(item.id);
    });
  });
}

function dedupeOrgs(db) {
  const duplicates = db.prepare(`
    SELECT user_id as userId, alias, MIN(id) as keepId
    FROM orgs
    GROUP BY user_id, alias
    HAVING COUNT(*) > 1
  `).all();

  const deleteOrg = db.prepare('DELETE FROM orgs WHERE id = ?');
  duplicates.forEach((row) => {
    const stale = db.prepare(
      'SELECT id FROM orgs WHERE user_id = ? AND alias = ? AND id != ? ORDER BY id ASC'
    ).all(row.userId, row.alias, row.keepId);
    stale.forEach((item) => deleteOrg.run(item.id));
  });
}

function applySafeFixes(db) {
  const tx = db.transaction(() => {
    syncTenantIds(db);
    dedupeProjects(db);
    dedupeOrgs(db);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_name ON projects(user_id, name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_user_alias ON orgs(user_id, alias);
      UPDATE projects SET destination_org = NULL WHERE source_org IS NOT NULL AND destination_org = source_org;
    `);
  });
  tx();
}

function collectFindings(db, rootDir) {
  const findings = [];

  const duplicateProjects = db.prepare(`
    SELECT user_id as userId, name, COUNT(*) as count
    FROM projects
    GROUP BY user_id, name
    HAVING COUNT(*) > 1
  `).all();
  duplicateProjects.forEach((row) => {
    addFinding(findings, 'error', 'duplicate_project_name', 'Duplicate project name for a user.', row);
  });

  const duplicateOrgs = db.prepare(`
    SELECT user_id as userId, alias, COUNT(*) as count
    FROM orgs
    GROUP BY user_id, alias
    HAVING COUNT(*) > 1
  `).all();
  duplicateOrgs.forEach((row) => {
    addFinding(findings, 'error', 'duplicate_org_alias', 'Duplicate org alias for a user.', row);
  });

  const mismatches = [
    ['projects', 'project'],
    ['orgs', 'org'],
    ['retrievals', 'retrieval'],
    ['comparisons', 'comparison'],
    ['deployments', 'deployment'],
    ['jobs', 'job']
  ];
  mismatches.forEach(([table, label]) => {
    const rows = db.prepare(
      `SELECT t.id, t.user_id as userId, t.tenant_id as tenantId, u.tenant_id as userTenantId
       FROM ${table} t
       JOIN users u ON u.id = t.user_id
       WHERE t.tenant_id != u.tenant_id`
    ).all();
    rows.forEach((row) => {
      addFinding(findings, 'error', 'tenant_mismatch', `Tenant mismatch on ${label} record.`, { table, ...row });
    });
  });

  const badAudit = db.prepare(
    `SELECT a.id, a.user_id as userId, a.tenant_id as tenantId, u.tenant_id as userTenantId
     FROM audit_logs a
     JOIN users u ON u.id = a.user_id
     WHERE a.user_id IS NOT NULL AND a.tenant_id != u.tenant_id`
  ).all();
  badAudit.forEach((row) => {
    addFinding(findings, 'error', 'tenant_mismatch', 'Tenant mismatch on audit log record.', { table: 'audit_logs', ...row });
  });

  const sameBindings = db.prepare(
    `SELECT id, user_id as userId, name, source_org as sourceOrg, destination_org as destinationOrg
     FROM projects
     WHERE source_org IS NOT NULL AND source_org != '' AND source_org = destination_org`
  ).all();
  sameBindings.forEach((row) => {
    addFinding(findings, 'error', 'same_org_binding', 'Project uses the same alias for source and destination.', row);
  });

  const projects = db.prepare(
    'SELECT id, user_id as userId, name, source_org as sourceOrg, destination_org as destinationOrg FROM projects ORDER BY name'
  ).all();
  const orgPairs = db.prepare('SELECT user_id as userId, alias FROM orgs').all();
  const available = new Set(orgPairs.map((row) => `${row.userId}::${row.alias}`));

  projects.forEach((project) => {
    if (project.sourceOrg && !available.has(`${project.userId}::${project.sourceOrg}`)) {
      addFinding(findings, 'error', 'missing_bound_org', 'Project source org alias does not exist for the owner.', project);
    }
    if (project.destinationOrg && !available.has(`${project.userId}::${project.destinationOrg}`)) {
      addFinding(findings, 'error', 'missing_bound_org', 'Project destination org alias does not exist for the owner.', project);
    }
    const projectDir = path.join(rootDir, project.userId, 'projects', project.name);
    if (!fs.existsSync(projectDir)) {
      addFinding(findings, 'warn', 'missing_project_dir', 'Project directory is missing on disk.', {
        projectId: project.id,
        userId: project.userId,
        name: project.name,
        projectDir
      });
    }
  });

  const orgs = db.prepare('SELECT id, user_id as userId, alias FROM orgs ORDER BY alias').all();
  orgs.forEach((org) => {
    const orgDir = path.join(rootDir, org.userId, 'orgs', org.alias);
    if (!fs.existsSync(orgDir)) {
      addFinding(findings, 'warn', 'missing_org_dir', 'Org directory is missing on disk.', {
        orgId: org.id,
        userId: org.userId,
        alias: org.alias,
        orgDir
      });
    }
  });

  return findings;
}

function printHuman(summary) {
  console.log(`Integrity check: ${summary.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Fix mode: ${summary.fixApplied ? 'enabled' : 'disabled'}`);
  console.log(`Findings: ${summary.findings.length}`);
  if (!summary.findings.length) return;
  summary.findings.forEach((finding, index) => {
    console.log(`${index + 1}. [${finding.severity}] ${finding.code}: ${finding.message}`);
    console.log(`   ${JSON.stringify(finding.meta)}`);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const db = new Database(args.db);
  const rootDir = path.resolve(args.root);

  if (args.fix) {
    applySafeFixes(db);
  }

  const findings = collectFindings(db, rootDir);
  const summary = {
    ok: findings.filter((item) => item.severity === 'error').length === 0,
    fixApplied: args.fix,
    findings
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHuman(summary);
  }

  process.exit(summary.ok ? 0 : 1);
}

main();
