import fs from 'fs';
import path from 'path';
import crypto from "crypto";
import { nanoid } from 'nanoid';
import { adminEmails } from './config';
import { getDb } from './db';
import { resolveUserPath } from './path';

export type TenantPlan = 'free' | 'pro' | 'enterprise';
export type UserRole = 'super_admin' | 'company_admin' | 'user';

export type UserRecord = {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  mfaSecret?: string | null;
  mfaEnabled?: boolean;
};

export type ProjectRecord = {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  sourceOrg: string | null;
  destinationOrg: string | null;
};

export type OrgRecord = {
  id: string;
  tenantId: string;
  userId: string;
  alias: string;
  info: Record<string, unknown>;
};

export type RetrievalRecord = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  target: 'source' | 'destination';
  logPath: string;
  count: number;
  createdAt: string;
};

export type ComparisonRecord = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  diffLog: string;
  reportPath?: string | null;
  reportRelPath?: string | null;
  deltaManifest?: string | null;
  destructiveManifest?: string | null;
  manifestStrategy?: string | null;
  sourceOrg?: string | null;
  destinationOrg?: string | null;
  jobStatus?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  completedAt?: string | null;
  changes: Record<string, unknown>[];
  createdAt: string;
};

export type DeploymentRecord = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  status: string;
  attempts: number;
  failedComponents: string[];
  manifestPath: string;
  deployLogPath: string;
  output: Record<string, unknown> | string;
  createdAt: string;
};

export type UpgradeRequestRecord = {
  id: string;
  tenantId: string;
  userId: string;
  requestedPlan: TenantPlan;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string | null;
};

export type JobRecord = {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string;
  type: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  error?: string | null;
};

export type TenantRecord = {
  id: string;
  name: string;
  domain: string;
  plan: TenantPlan;
  maxUsers?: number | null;
  maxProjects?: number | null;
  maxOrgs?: number | null;
  maxStorageBytes?: number | null;
  maxRetrieves?: number | null;
  maxDeploys?: number | null;
  createdAt: string;
};

export type TenantUsage = {
  users: number;
  projects: number;
  orgs: number;
  storageBytes: number;
  retrieves: number;
  deploys: number;
};

export type AuditLogEntry = {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

export const planLimits: Record<TenantPlan, { maxUsers: number; maxProjects: number; maxOrgs: number; maxStorageBytes: number; maxRetrieves: number; maxDeploys: number }> = {
  free: { maxUsers: 5, maxProjects: 3, maxOrgs: 2, maxStorageBytes: 2 * 1024 * 1024 * 1024, maxRetrieves: 30, maxDeploys: 10 },
  pro: { maxUsers: 25, maxProjects: 20, maxOrgs: 10, maxStorageBytes: 50 * 1024 * 1024 * 1024, maxRetrieves: 300, maxDeploys: 100 },
  enterprise: { maxUsers: 500, maxProjects: 200, maxOrgs: 100, maxStorageBytes: 500 * 1024 * 1024 * 1024, maxRetrieves: 1000, maxDeploys: 500 }
};

function normalizeDomain(email: string) {
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 ? parts[1].trim() : '';
}

function isDedicatedTenant(tenant: TenantRecord | null) {
  if (!tenant) return false;
  return tenant.domain?.startsWith('user:');
}

function getOrCreateEnterpriseTenant(domain: string, email?: string) {
  const normalized = domain?.trim() || '';
  if (normalized) {
    const existing = getTenantByDomain(normalized);
    if (existing) {
      if (existing.plan !== 'enterprise') {
        updateTenantPlan(existing.id, 'enterprise');
      }
      return existing.id;
    }
    const name = email?.toLowerCase() || normalized.split('.')[0]?.toUpperCase() || 'Enterprise';
    return createTenant(name, normalized, 'enterprise').id;
  }
  const preferred = getDefaultTenantId();
  if (preferred) {
    const existing = getTenantById(preferred);
    if (existing) {
      if (existing.plan !== 'enterprise') {
        updateTenantPlan(existing.id, 'enterprise');
      }
      return existing.id;
    }
  }
  const shared = getTenantByDomain('enterprise_shared');
  if (shared) {
    if (shared.plan !== 'enterprise') {
      updateTenantPlan(shared.id, 'enterprise');
    }
    return shared.id;
  }
  return createTenant(email?.toLowerCase() || 'Enterprise Shared', 'enterprise_shared', 'enterprise').id;
}

function defaultTenant(db = getDb()) {
  const row = db.prepare('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
  return row?.id || 'tenant_default';
}

function getDefaultTenantPlan() {
  const db = getDb();
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('default_tenant_plan') as { value_json?: string } | undefined;
  if (!row?.value_json) return 'free';
  try {
    const value = JSON.parse(row.value_json);
    return typeof value === 'string' ? value : 'free';
  } catch {
    return 'free';
  }
}

export function getDefaultTenantId() {
  const db = getDb();
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('default_tenant_id') as { value_json?: string } | undefined;
  if (!row?.value_json) return null;
  try {
    const value = JSON.parse(row.value_json);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function getTenantById(tenantId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    plan: row.plan,
    maxUsers: row.max_users ?? null,
    maxProjects: row.max_projects ?? null,
    maxOrgs: row.max_orgs ?? null,
    maxStorageBytes: row.max_storage_bytes ?? null,
    maxRetrieves: row.max_retrieves ?? null,
    maxDeploys: row.max_deploys ?? null,
    createdAt: row.created_at
  } as TenantRecord;
}

export function getTenantByDomain(domain: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tenants WHERE domain = ?').get(domain);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    plan: row.plan,
    maxUsers: row.max_users ?? null,
    maxProjects: row.max_projects ?? null,
    maxOrgs: row.max_orgs ?? null,
    maxStorageBytes: row.max_storage_bytes ?? null,
    maxRetrieves: row.max_retrieves ?? null,
    maxDeploys: row.max_deploys ?? null,
    createdAt: row.created_at
  } as TenantRecord;
}

export function createTenant(name: string, domain: string, plan: TenantPlan = 'free') {
  const db = getDb();
  const id = `tenant_${nanoid(10)}`;
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO tenants (id, name, domain, plan, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    domain,
    plan,
    createdAt
  );
  return getTenantById(id) as TenantRecord;
}

export function getTenantUsage(tenantId: string) {
  const db = getDb();
  const users = db.prepare('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?').get(tenantId).count as number;
  const projects = db.prepare('SELECT COUNT(*) as count FROM projects WHERE tenant_id = ?').get(tenantId).count as number;
  const orgs = db.prepare('SELECT COUNT(*) as count FROM orgs WHERE tenant_id = ?').get(tenantId).count as number;
  const windowStart = usageWindowStartUtc();
  const retrieves = db
    .prepare('SELECT COUNT(*) as count FROM retrievals WHERE tenant_id = ? AND created_at >= ?')
    .get(tenantId, windowStart).count as number;
  const deploys = db
    .prepare('SELECT COUNT(*) as count FROM deployments WHERE tenant_id = ? AND created_at >= ?')
    .get(tenantId, windowStart).count as number;
  let storageBytes = 0;
  const rows = db.prepare('SELECT user_id as userId, name FROM projects WHERE tenant_id = ?').all(tenantId) as Array<{ userId: string; name: string }>;
  rows.forEach((row) => {
    const projectPath = resolveUserPath(row.userId, 'projects', row.name);
    storageBytes += folderSizeBytes(projectPath);
  });
  return { users, projects, orgs, storageBytes, retrieves, deploys } as TenantUsage;
}

function folderSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += folderSizeBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  });
  return total;
}

function usageWindowStartUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return start.toISOString();
}

export function listTenants() {
  const db = getDb();
  return db
    .prepare('SELECT * FROM tenants ORDER BY created_at ASC')
    .all()
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      plan: row.plan,
      maxUsers: row.max_users ?? null,
      maxProjects: row.max_projects ?? null,
      maxOrgs: row.max_orgs ?? null,
      maxStorageBytes: row.max_storage_bytes ?? null,
      maxRetrieves: row.max_retrieves ?? null,
      maxDeploys: row.max_deploys ?? null,
      createdAt: row.created_at
    })) as TenantRecord[];
}

export function updateTenantLimits(
  tenantId: string,
  limits: {
    maxUsers?: number | null;
    maxProjects?: number | null;
    maxOrgs?: number | null;
    maxStorageBytes?: number | null;
    maxRetrieves?: number | null;
    maxDeploys?: number | null;
  }
) {
  const db = getDb();
  db.prepare(
    'UPDATE tenants SET max_users = ?, max_projects = ?, max_orgs = ?, max_storage_bytes = ?, max_retrieves = ?, max_deploys = ? WHERE id = ?'
  ).run(
    limits.maxUsers ?? null,
    limits.maxProjects ?? null,
    limits.maxOrgs ?? null,
    limits.maxStorageBytes ?? null,
    limits.maxRetrieves ?? null,
    limits.maxDeploys ?? null,
    tenantId
  );
  return getTenantById(tenantId);
}

export function updateTenantPlan(tenantId: string, plan: TenantPlan) {
  const db = getDb();
  db.prepare('UPDATE tenants SET plan = ? WHERE id = ?').run(plan, tenantId);
  return getTenantById(tenantId);
}

export function getPlanLimits() {
  const db = getDb();
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('plan_limits') as { value_json?: string } | undefined;
  if (!row?.value_json) return planLimits;
  try {
    return { ...planLimits, ...(JSON.parse(row.value_json) as Record<string, any>) };
  } catch {
    return planLimits;
  }
}

export function setPlanLimits(
  limits: Record<string, { maxUsers: number; maxProjects: number; maxOrgs: number; maxStorageBytes: number; maxRetrieves: number; maxDeploys: number }>
) {
  const db = getDb();
  const payload = JSON.stringify(limits);
  db.prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)').run('plan_limits', payload);
  return getPlanLimits();
}

function getSetting(key: string) {
  const db = getDb();
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as { value_json?: string } | undefined;
  if (!row?.value_json) return null;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
}

function setSetting(key: string, value: unknown) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)').run(key, JSON.stringify(value));
}

export function getPrivateDocsPassword() {
  const password = getSetting('private_docs_password');
  return typeof password === 'string' ? password : null;
}

export function setPrivateDocsPassword(password: string) {
  setSetting('private_docs_password', password);
  return password;
}

export function getAdminSettings() {
  return { defaultTenantPlan: getDefaultTenantPlan(), defaultTenantId: getDefaultTenantId() };
}

export function setAdminSettings(payload: { defaultTenantPlan?: TenantPlan; defaultTenantId?: string | null }) {
  const db = getDb();
  if (payload.defaultTenantPlan) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)').run(
      'default_tenant_plan',
      JSON.stringify(payload.defaultTenantPlan)
    );
  }
  if (payload.defaultTenantId !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)').run(
      'default_tenant_id',
      JSON.stringify(payload.defaultTenantId)
    );
  }
  return getAdminSettings();
}

export function canCreateUser(tenantId: string) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return false;
  const limits = getPlanLimits()[tenant.plan] || planLimits.free;
  const usage = getTenantUsage(tenantId);
  const maxUsers = tenant.maxUsers ?? limits.maxUsers;
  return usage.users < maxUsers;
}

export function canCreateProject(tenantId: string) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return false;
  const limits = getPlanLimits()[tenant.plan] || planLimits.free;
  const usage = getTenantUsage(tenantId);
  const maxProjects = tenant.maxProjects ?? limits.maxProjects;
  return usage.projects < maxProjects;
}

export function canCreateOrg(tenantId: string) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return false;
  const limits = getPlanLimits()[tenant.plan] || planLimits.free;
  const usage = getTenantUsage(tenantId);
  const maxOrgs = tenant.maxOrgs ?? limits.maxOrgs;
  return usage.orgs < maxOrgs;
}

export function canRunRetrieve(tenantId: string) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return false;
  const limits = getPlanLimits()[tenant.plan] || planLimits.free;
  const usage = getTenantUsage(tenantId);
  const maxRetrieves = tenant.maxRetrieves ?? limits.maxRetrieves;
  return usage.retrieves < maxRetrieves;
}

export function canRunDeploy(tenantId: string) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return false;
  const limits = getPlanLimits()[tenant.plan] || planLimits.free;
  const usage = getTenantUsage(tenantId);
  const maxDeploys = tenant.maxDeploys ?? limits.maxDeploys;
  return usage.deploys < maxDeploys;
}

export function createUpgradeRequest(tenantId: string, userId: string, requestedPlan: TenantPlan) {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM upgrade_requests WHERE tenant_id = ? AND status = ?')
    .get(tenantId, 'pending');
  if (existing) {
    throw new Error('An upgrade request is already pending.');
  }
  const entry: UpgradeRequestRecord = {
    id: crypto.randomUUID().replace(/-/g,"").substring(0, 16),
    tenantId,
    userId,
    requestedPlan,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null
  };
  db.prepare(
    'INSERT INTO upgrade_requests (id, tenant_id, user_id, requested_plan, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(entry.id, entry.tenantId, entry.userId, entry.requestedPlan, entry.status, entry.createdAt, entry.resolvedAt);
  return entry;
}

export function listUpgradeRequests() {
  const db = getDb();
  return db
    .prepare(
      'SELECT r.id, r.tenant_id as tenantId, r.user_id as userId, r.requested_plan as requestedPlan, r.status, r.created_at as createdAt, r.resolved_at as resolvedAt, r.applied_at as appliedAt, u.email as email, t.name as tenantName FROM upgrade_requests r JOIN users u ON r.user_id = u.id JOIN tenants t ON r.tenant_id = t.id ORDER BY r.created_at DESC'
    )
    .all() as Array<UpgradeRequestRecord & { email: string; tenantName: string }>;
}

export function resolveUpgradeRequest(requestId: string, action: 'approved' | 'rejected') {
  const db = getDb();
  const request = db
    .prepare('SELECT id, tenant_id as tenantId, user_id as userId, requested_plan as requestedPlan FROM upgrade_requests WHERE id = ?')
    .get(requestId) as { id: string; tenantId: string; userId: string; requestedPlan: TenantPlan } | undefined;
  if (!request) return null;
  const resolvedAt = new Date().toISOString();
  const appliedAt = action === 'approved' ? resolvedAt : null;
  db.prepare('UPDATE upgrade_requests SET status = ?, resolved_at = ?, applied_at = ? WHERE id = ?').run(
    action,
    resolvedAt,
    appliedAt,
    requestId
  );
  if (action === 'approved') {
    const userRow = db.prepare('SELECT email, tenant_id as tenantId FROM users WHERE id = ?').get(request.userId) as
      | { email?: string; tenantId?: string }
      | undefined;
    const currentTenant = userRow?.tenantId ? getTenantById(userRow.tenantId) : null;
    if (request.requestedPlan === 'enterprise') {
      const domain = userRow?.email ? normalizeDomain(userRow.email) : '';
      if (currentTenant?.plan === 'enterprise') {
        return request;
      }
      const enterpriseTenantId = getOrCreateEnterpriseTenant(domain, userRow?.email);
      if (!currentTenant || currentTenant.id !== enterpriseTenantId) {
        updateUserTenant(request.userId, enterpriseTenantId);
      }
    } else if (request.requestedPlan === 'free' || request.requestedPlan === 'pro') {
      if (currentTenant && isDedicatedTenant(currentTenant)) {
        if (currentTenant.plan !== request.requestedPlan) {
          updateTenantPlan(currentTenant.id, request.requestedPlan);
        }
      } else {
        const label = userRow?.email?.toLowerCase() || request.requestedPlan.toUpperCase();
        const created = createTenant(label, `user:${nanoid(6)}`, request.requestedPlan);
        updateUserTenant(request.userId, created.id);
      }
    }
  }
  return request;
}

export function reapplyApprovedUpgrades() {
  const db = getDb();
  const rows = db
    .prepare('SELECT id FROM upgrade_requests WHERE status = ? AND applied_at IS NULL ORDER BY created_at ASC')
    .all('approved') as Array<{ id: string }>;
  const applied = [] as string[];
  rows.forEach((row) => {
    const resolved = resolveUpgradeRequest(row.id, 'approved');
    if (resolved) applied.push(row.id);
  });
  return { applied };
}

let upgradeSyncDone = false;
export function ensureUpgradeSync() {
  if (upgradeSyncDone) return;
  upgradeSyncDone = true;
  reapplyApprovedUpgrades();
}

export function createUser(email: string, passwordHash: string) {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count as number;
  let role: UserRecord['role'] = 'user';
  let tenantId = getDefaultTenantId() || defaultTenant(db);
  const defaultPlan = getDefaultTenantPlan() as TenantPlan;
  if (adminEmails.includes(email) || count === 0) {
    role = 'super_admin';
    tenantId = defaultTenant(db);
  } else {
    const domain = normalizeDomain(email);
    if (defaultPlan === 'free' || defaultPlan === 'pro') {
      const label = email.toLowerCase();
      const created = createTenant(label, `user:${nanoid(6)}`, defaultPlan);
      tenantId = created.id;
      role = 'company_admin';
    } else if (defaultPlan === 'enterprise') {
      const enterpriseTenantId = getOrCreateEnterpriseTenant(domain, email);
      tenantId = enterpriseTenantId;
      role = domain ? 'company_admin' : 'user';
    }
  }
  if (role !== 'super_admin' && !canCreateUser(tenantId)) {
    throw new Error('Tenant user limit reached.');
  }
  const user: UserRecord = { id: crypto.randomUUID().replace(/-/g,"").substring(0, 16), tenantId, email, passwordHash, role };
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    user.id,
    user.tenantId,
    user.email,
    user.passwordHash,
    user.role,
    createdAt
  );
  return user;
}

export function createUserInTenant(tenantId: string, email: string, passwordHash: string, role: UserRole = 'user') {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('Account already exists.');
  }
  if (role !== 'super_admin' && !canCreateUser(tenantId)) {
    throw new Error('Tenant user limit reached.');
  }
  const user: UserRecord = { id: crypto.randomUUID().replace(/-/g,"").substring(0, 16), tenantId, email, passwordHash, role };
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    user.id,
    user.tenantId,
    user.email,
    user.passwordHash,
    user.role,
    createdAt
  );
  return user;
}

export function findUserByEmail(email: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    mfaSecret: row.mfa_secret ?? null,
    mfaEnabled: Boolean(row.mfa_enabled)
  } as UserRecord;
}

export function findUserById(userId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    mfaSecret: row.mfa_secret ?? null,
    mfaEnabled: Boolean(row.mfa_enabled)
  } as UserRecord;
}

export type PasswordResetRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
  ip?: string | null;
  userAgent?: string | null;
};

export function createPasswordReset(entry: Omit<PasswordResetRecord, 'id' | 'createdAt'>) {
  const db = getDb();
  const record: PasswordResetRecord = {
    id: crypto.randomUUID().replace(/-/g,"").substring(0, 16),
    createdAt: new Date().toISOString(),
    ...entry
  };
  db.prepare(
    'INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    record.id,
    record.userId,
    record.tokenHash,
    record.expiresAt,
    record.usedAt ?? null,
    record.createdAt,
    record.ip ?? null,
    record.userAgent ?? null
  );
  return record;
}

export function getPasswordResetByTokenHash(tokenHash: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? null,
    createdAt: row.created_at,
    ip: row.ip ?? null,
    userAgent: row.user_agent ?? null
  } as PasswordResetRecord;
}

export function markPasswordResetUsed(id: string) {
  const db = getDb();
  const usedAt = new Date().toISOString();
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(usedAt, id);
  return usedAt;
}

export function purgeExpiredPasswordResets() {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('DELETE FROM password_resets WHERE used_at IS NOT NULL OR expires_at < ?').run(now);
}

export function getUserProfile(userId: string) {
  const db = getDb();
  const row = db.prepare('SELECT id, email, role, name, company, social_json, mfa_enabled as mfaEnabled FROM users WHERE id = ?').get(userId);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name || '',
    company: row.company || '',
    social: row.social_json ? JSON.parse(row.social_json) : {},
    mfaEnabled: Boolean(row.mfaEnabled)
  };
}

export function updateUserProfile(
  userId: string,
  payload: { name?: string; company?: string; social?: Record<string, string> }
) {
  const db = getDb();
  const name = payload.name ?? null;
  const company = payload.company ?? null;
  const social = payload.social ? JSON.stringify(payload.social) : null;
  db.prepare('UPDATE users SET name = ?, company = ?, social_json = ? WHERE id = ?').run(name, company, social, userId);
  return getUserProfile(userId);
}

export function saveUserMfaSecret(userId: string, secret: string) {
  const db = getDb();
  db.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?').run(secret, userId);
}

export function enableUserMfa(userId: string) {
  const db = getDb();
  db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(userId);
}

export function disableUserMfa(userId: string) {
  const db = getDb();
  db.prepare('UPDATE users SET mfa_secret = NULL, mfa_enabled = 0 WHERE id = ?').run(userId);
}

export function listAllUsers() {
  const db = getDb();
  return db
    .prepare('SELECT id, tenant_id as tenantId, email, role FROM users ORDER BY email ASC')
    .all();
}

export function updateUserRole(userId: string, role: UserRole) {
  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  return db.prepare('SELECT id, tenant_id as tenantId, email, role FROM users WHERE id = ?').get(userId);
}

export function updateUserTenant(userId: string, tenantId: string) {
  const db = getDb();
  db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tenantId, userId);
  db.prepare('UPDATE projects SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  db.prepare('UPDATE orgs SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  db.prepare('UPDATE retrievals SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  db.prepare('UPDATE comparisons SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  db.prepare('UPDATE deployments SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  db.prepare('UPDATE jobs SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  db.prepare('UPDATE audit_logs SET tenant_id = ? WHERE user_id = ?').run(tenantId, userId);
  return db.prepare('SELECT id, tenant_id as tenantId, email, role FROM users WHERE id = ?').get(userId);
}

export function listUsersByTenant(tenantId: string) {
  const db = getDb();
  return db
    .prepare('SELECT id, tenant_id as tenantId, email, role FROM users WHERE tenant_id = ? ORDER BY email ASC')
    .all(tenantId);
}

export function listProjectsByTenant(tenantId: string) {
  const db = getDb();
  return db
    .prepare(
      'SELECT p.id, p.tenant_id as tenantId, p.user_id as userId, p.name, p.source_org as sourceOrg, p.destination_org as destinationOrg, u.email as ownerEmail FROM projects p JOIN users u ON p.user_id = u.id WHERE p.tenant_id = ? ORDER BY p.name ASC'
    )
    .all(tenantId);
}

export function listOrgsByTenant(tenantId: string) {
  const db = getDb();
  return db
    .prepare(
      'SELECT o.id, o.tenant_id as tenantId, o.user_id as userId, o.alias, o.info_json as infoJson, u.email as ownerEmail FROM orgs o JOIN users u ON o.user_id = u.id WHERE o.tenant_id = ? ORDER BY o.alias ASC'
    )
    .all(tenantId)
    .map((row: any) => ({
      ...row,
      info: row.infoJson ? JSON.parse(row.infoJson) : {}
    }));
}

export function listProjects(userId: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM projects WHERE user_id = ?')
    .all(userId)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      name: row.name,
      sourceOrg: row.source_org,
      destinationOrg: row.destination_org
    })) as ProjectRecord[];
}

export function getProject(userId: string, projectId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE user_id = ? AND id = ?').get(userId, projectId);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    sourceOrg: row.source_org,
    destinationOrg: row.destination_org
  } as ProjectRecord;
}

export function upsertProject(project: ProjectRecord) {
  const db = getDb();
  const trimmedName = String(project.name || '').trim();
  if (!trimmedName) {
    throw new Error('Project name is required');
  }
  const id = project.id || crypto.randomUUID().replace(/-/g,"").substring(0, 16);
  const duplicate = db.prepare('SELECT id FROM projects WHERE user_id = ? AND name = ? AND id != ?').get(project.userId, trimmedName, id);
  if (duplicate) {
    throw new Error(`Project "${trimmedName}" already exists.`);
  }
  const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (exists) {
    db.prepare('UPDATE projects SET name = ?, source_org = ?, destination_org = ? WHERE id = ?').run(
      trimmedName,
      project.sourceOrg,
      project.destinationOrg,
      id
    );
  } else {
    db.prepare('INSERT INTO projects (id, tenant_id, user_id, name, source_org, destination_org) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      project.tenantId,
      project.userId,
      trimmedName,
      project.sourceOrg,
      project.destinationOrg
    );
  }
  return getProject(project.userId, id) as ProjectRecord;
}

export function listOrgs(userId: string) {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM orgs WHERE user_id = ?')
    .all(userId)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      alias: row.alias,
      info: row.info_json ? JSON.parse(row.info_json) : {}
    })) as OrgRecord[];
  const byAlias = new Map<string, OrgRecord>();
  rows.forEach((row) => byAlias.set(row.alias, row));
  return Array.from(byAlias.values());
}

export function getOrg(userId: string, alias: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orgs WHERE user_id = ? AND alias = ?').get(userId, alias);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    alias: row.alias,
    info: row.info_json ? JSON.parse(row.info_json) : {}
  } as OrgRecord;
}

export function linkOrg(org: OrgRecord) {
  const db = getDb();
  const alias = String(org.alias || '').trim();
  if (!alias) {
    throw new Error('Org alias is required.');
  }
  const existingByAlias = db
    .prepare('SELECT id FROM orgs WHERE user_id = ? AND alias = ?')
    .get(org.userId, alias);
  const id = org.id || existingByAlias?.id || crypto.randomUUID().replace(/-/g,"").substring(0, 16);
  const exists = db.prepare('SELECT id FROM orgs WHERE id = ?').get(id);
  const duplicate = db.prepare('SELECT id FROM orgs WHERE user_id = ? AND alias = ? AND id != ?').get(org.userId, alias, id);
  if (duplicate) {
    throw new Error(`Org alias "${alias}" already exists.`);
  }
  const infoJson = JSON.stringify(org.info || {});
  if (exists) {
    db.prepare('UPDATE orgs SET alias = ?, info_json = ? WHERE id = ?').run(alias, infoJson, id);
  } else {
    db.prepare('INSERT INTO orgs (id, tenant_id, user_id, alias, info_json) VALUES (?, ?, ?, ?, ?)').run(
      id,
      org.tenantId,
      org.userId,
      alias,
      infoJson
    );
  }
  return getOrg(org.userId, alias) as OrgRecord;
}

export function deleteOrg(userId: string, alias: string) {
  const db = getDb();
  db.prepare('DELETE FROM orgs WHERE user_id = ? AND alias = ?').run(userId, alias);
  db.prepare('UPDATE projects SET source_org = NULL WHERE user_id = ? AND source_org = ?').run(userId, alias);
  db.prepare('UPDATE projects SET destination_org = NULL WHERE user_id = ? AND destination_org = ?').run(userId, alias);
}

export function renameOrgAlias(userId: string, oldAlias: string, newAlias: string) {
  const db = getDb();
  const trimmedAlias = String(newAlias || '').trim();
  if (!trimmedAlias) {
    throw new Error('Org alias is required.');
  }
  const duplicate = db.prepare('SELECT id FROM orgs WHERE user_id = ? AND alias = ? AND alias != ?').get(userId, trimmedAlias, oldAlias);
  if (duplicate) {
    throw new Error(`Org alias "${trimmedAlias}" already exists.`);
  }
  db.prepare('UPDATE orgs SET alias = ? WHERE user_id = ? AND alias = ?').run(trimmedAlias, userId, oldAlias);
  db.prepare('UPDATE projects SET source_org = ? WHERE user_id = ? AND source_org = ?').run(trimmedAlias, userId, oldAlias);
  db.prepare('UPDATE projects SET destination_org = ? WHERE user_id = ? AND destination_org = ?').run(trimmedAlias, userId, oldAlias);
}

export function getProjectByName(userId: string, name: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE user_id = ? AND name = ?').get(userId, name);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    sourceOrg: row.source_org,
    destinationOrg: row.destination_org
  } as ProjectRecord;
}

export function deleteProject(userId: string, projectId: string) {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').run(userId, projectId);
  db.prepare('DELETE FROM retrievals WHERE user_id = ? AND project_id = ?').run(userId, projectId);
  db.prepare('DELETE FROM comparisons WHERE user_id = ? AND project_id = ?').run(userId, projectId);
  db.prepare('DELETE FROM deployments WHERE user_id = ? AND project_id = ?').run(userId, projectId);
}

export function saveRetrieval(record: Omit<RetrievalRecord, 'id' | 'createdAt'>) {
  const db = getDb();
  const entry: RetrievalRecord = { ...record, id: crypto.randomUUID().replace(/-/g,"").substring(0, 16), createdAt: new Date().toISOString() };
  db.prepare(
    'INSERT INTO retrievals (id, tenant_id, user_id, project_id, target, log_path, count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(entry.id, entry.tenantId, entry.userId, entry.projectId, entry.target, entry.logPath, entry.count, entry.createdAt);
  return entry;
}

export function saveComparison(record: Omit<ComparisonRecord, 'id' | 'createdAt'> & { id?: string }) {
  const db = getDb();
  const entry: ComparisonRecord = { ...record, id: record.id || crypto.randomUUID().replace(/-/g,"").substring(0, 16), createdAt: new Date().toISOString() };
  db.prepare(
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.tenantId,
    entry.userId,
    entry.projectId,
    entry.diffLog,
    entry.reportPath || null,
    entry.reportRelPath || null,
    entry.deltaManifest || null,
    entry.destructiveManifest || null,
    entry.manifestStrategy || null,
    entry.sourceOrg || null,
    entry.destinationOrg || null,
    entry.jobStatus ? JSON.stringify(entry.jobStatus) : null,
    entry.snapshot ? JSON.stringify(entry.snapshot) : null,
    entry.completedAt || null,
    JSON.stringify(entry.changes || []),
    entry.createdAt
  );
  return entry;
}

export function updateComparison(
  id: string,
  fields: Partial<Omit<ComparisonRecord, 'id' | 'tenantId' | 'userId' | 'projectId' | 'createdAt'>>
) {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];
  const setIf = (column: string, value: any, serialize = false) => {
    if (value === undefined) return;
    updates.push(`${column} = ?`);
    values.push(serialize ? JSON.stringify(value) : value);
  };
  setIf('diff_log', fields.diffLog);
  setIf('report_path', fields.reportPath);
  setIf('report_rel_path', fields.reportRelPath);
  setIf('delta_manifest', fields.deltaManifest);
  setIf('destructive_manifest', fields.destructiveManifest);
  setIf('manifest_strategy', fields.manifestStrategy);
  setIf('source_org', fields.sourceOrg);
  setIf('destination_org', fields.destinationOrg);
  setIf('job_status_json', fields.jobStatus, true);
  setIf('snapshot_json', fields.snapshot, true);
  setIf('completed_at', fields.completedAt);
  setIf('changes_json', fields.changes, true);
  if (!updates.length) return;
  db.prepare(`UPDATE comparisons SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
}

export function saveDeployment(record: Omit<DeploymentRecord, 'id' | 'createdAt'>) {
  const db = getDb();
  const entry: DeploymentRecord = { ...record, id: crypto.randomUUID().replace(/-/g,"").substring(0, 16), createdAt: new Date().toISOString() };
  db.prepare(
    'INSERT INTO deployments (id, tenant_id, user_id, project_id, status, attempts, failed_components_json, manifest_path, deploy_log_path, output_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    entry.id,
    entry.tenantId,
    entry.userId,
    entry.projectId,
    entry.status,
    entry.attempts,
    JSON.stringify(entry.failedComponents || []),
    entry.manifestPath,
    entry.deployLogPath,
    JSON.stringify(entry.output || {}),
    entry.createdAt
  );
  return entry;
}

export function enqueueJob(record: Omit<JobRecord, 'id' | 'createdAt' | 'attempts' | 'status'> & { id?: string; status?: JobRecord['status'] }) {
  const db = getDb();
  const entry: JobRecord = {
    ...record,
    id: record.id || crypto.randomUUID().replace(/-/g,"").substring(0, 16),
    status: record.status || 'queued',
    attempts: 0,
    createdAt: new Date().toISOString()
  };
  db.prepare(
    `INSERT INTO jobs (
      id,
      tenant_id,
      user_id,
      project_id,
      type,
      status,
      payload_json,
      attempts,
      created_at,
      started_at,
      completed_at,
      updated_at,
      error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.tenantId,
    entry.userId,
    entry.projectId,
    entry.type,
    entry.status,
    JSON.stringify(entry.payload || {}),
    entry.attempts,
    entry.createdAt,
    entry.startedAt || null,
    entry.completedAt || null,
    entry.updatedAt || null,
    entry.error || null
  );
  return entry;
}

export function claimNextJob(type: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    const job = db
      .prepare('SELECT * FROM jobs WHERE status = ? AND type = ? ORDER BY created_at ASC LIMIT 1')
      .get('queued', type);
    if (!job) return null;
    db.prepare('UPDATE jobs SET status = ?, started_at = ?, updated_at = ? WHERE id = ?').run('running', now, now, job.id);
    return { ...job, status: 'running', started_at: now, updated_at: now };
  });
  const row = transaction();
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    payload: row.payload_json ? JSON.parse(row.payload_json) : {},
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    error: row.error
  } as JobRecord;
}

export function updateJob(id: string, fields: Partial<Omit<JobRecord, 'id' | 'tenantId' | 'userId' | 'projectId' | 'type' | 'payload' | 'createdAt'>>) {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];
  const setIf = (column: string, value: any, serialize = false) => {
    if (value === undefined) return;
    updates.push(`${column} = ?`);
    values.push(serialize ? JSON.stringify(value) : value);
  };
  setIf('status', fields.status);
  setIf('attempts', fields.attempts);
  setIf('started_at', fields.startedAt);
  setIf('completed_at', fields.completedAt);
  setIf('updated_at', fields.updatedAt);
  setIf('error', fields.error);
  if (!updates.length) return;
  db.prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
}

export function getJob(userId: string, id: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    payload: row.payload_json ? JSON.parse(row.payload_json) : {},
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    error: row.error
  } as JobRecord;
}

export function listJobs(userId: string, projectId?: string, status?: JobRecord['status']) {
  const db = getDb();
  const params: any[] = [userId];
  let where = 'user_id = ?';
  if (projectId) {
    where += ' AND project_id = ?';
    params.push(projectId);
  }
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  return db
    .prepare(`SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC`)
    .all(...params)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      projectId: row.project_id,
      type: row.type,
      status: row.status,
      payload: row.payload_json ? JSON.parse(row.payload_json) : {},
      attempts: row.attempts,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
      error: row.error
    })) as JobRecord[];
}

export function jobQueueStats(userId: string, projectId?: string, jobId?: string) {
  const db = getDb();
  const params: any[] = [userId];
  let where = 'user_id = ?';
  if (projectId) {
    where += ' AND project_id = ?';
    params.push(projectId);
  }
  const running = db.prepare(`SELECT COUNT(*) as count FROM jobs WHERE ${where} AND status = 'running'`).get(...params).count as number;
  const queued = db.prepare(`SELECT COUNT(*) as count FROM jobs WHERE ${where} AND status = 'queued'`).get(...params).count as number;
  let position: number | null = null;
  if (jobId) {
    const job = db.prepare(`SELECT id, status, created_at FROM jobs WHERE id = ? AND ${where}`).get(jobId, ...params);
    if (job?.status === 'queued') {
      position = db
        .prepare(`SELECT COUNT(*) as count FROM jobs WHERE ${where} AND status = 'queued' AND created_at < ?`)
        .get(...params, job.created_at).count as number;
    } else if (job?.status === 'running') {
      position = 0;
    }
  }
  const recent = db
    .prepare(`SELECT created_at, completed_at FROM comparisons WHERE ${where} AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 5`)
    .all(...params);
  const durations = recent
    .map((row: any) => {
      const start = new Date(row.created_at).getTime();
      const end = new Date(row.completed_at).getTime();
      return end > start ? Math.round((end - start) / 1000) : null;
    })
    .filter((value: number | null): value is number => typeof value === 'number');
  const avgDurationSeconds = durations.length
    ? Math.round(durations.reduce((sum: number, value: number) => sum + value, 0) / durations.length)
    : null;
  const etaSeconds = position !== null && avgDurationSeconds ? position * avgDurationSeconds : null;
  return { running, queued, position, avgDurationSeconds, etaSeconds };
}

export function listRetrievals(userId: string, projectId: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM retrievals WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC')
    .all(userId, projectId)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      projectId: row.project_id,
      target: row.target,
      logPath: row.log_path,
      count: row.count,
      createdAt: row.created_at
    })) as RetrievalRecord[];
}

export function listComparisons(userId: string, projectId: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM comparisons WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC')
    .all(userId, projectId)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      projectId: row.project_id,
      diffLog: row.diff_log,
      reportPath: row.report_path,
      reportRelPath: row.report_rel_path,
      deltaManifest: row.delta_manifest,
      destructiveManifest: row.destructive_manifest,
      manifestStrategy: row.manifest_strategy,
      sourceOrg: row.source_org,
      destinationOrg: row.destination_org,
      jobStatus: row.job_status_json ? JSON.parse(row.job_status_json) : null,
      snapshot: row.snapshot_json ? JSON.parse(row.snapshot_json) : null,
      completedAt: row.completed_at,
      changes: row.changes_json ? JSON.parse(row.changes_json) : [],
      createdAt: row.created_at
    })) as ComparisonRecord[];
}

export function listDeployments(userId: string, projectId: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM deployments WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC')
    .all(userId, projectId)
    .map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      projectId: row.project_id,
      status: row.status,
      attempts: row.attempts,
      failedComponents: row.failed_components_json ? JSON.parse(row.failed_components_json) : [],
      manifestPath: row.manifest_path,
      deployLogPath: row.deploy_log_path,
      output: row.output_json ? JSON.parse(row.output_json) : {},
      createdAt: row.created_at
    })) as DeploymentRecord[];
}

export function logAuditEvent(entry: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const db = getDb();
  const id = crypto.randomUUID().replace(/-/g,"").substring(0, 16);
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO audit_logs (id, tenant_id, user_id, action, target_type, target_id, details_json, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    entry.tenantId ?? null,
    entry.userId ?? null,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.ip ?? null,
    entry.userAgent ?? null,
    createdAt
  );
  return { id, createdAt };
}

export function listAuditLogs(limit = 100) {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<any>;
  return rows.map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id ?? null,
    userId: row.user_id ?? null,
    action: row.action,
    targetType: row.target_type ?? null,
    targetId: row.target_id ?? null,
    details: row.details_json ? JSON.parse(row.details_json) : null,
    ip: row.ip ?? null,
    userAgent: row.user_agent ?? null,
    createdAt: row.created_at
  })) as AuditLogEntry[];
}
