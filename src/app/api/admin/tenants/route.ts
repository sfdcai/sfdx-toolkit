import fs from 'fs';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { resolveUserPath } from '@/lib/path';
import { createTenant, getTenantUsage, listTenants, updateTenantLimits, updateTenantPlan } from '@/lib/store';
import { recordAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const tenants = listTenants().map((tenant) => ({
    ...tenant,
    usage: getTenantUsage(tenant.id)
  }));
  return NextResponse.json({ tenants });
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { name, domain, plan } = body || {};
  if (!name || !domain) return NextResponse.json({ message: 'name and domain required' }, { status: 400 });
  const created = createTenant(name, domain, plan || 'free');
  recordAudit(req as any, user, 'tenant.create', 'tenant', created.id, { name, domain, plan: plan || 'free' });
  return NextResponse.json({ tenant: created });
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { tenantId, plan, limits } = body || {};
  if (!tenantId) return NextResponse.json({ message: 'tenantId required' }, { status: 400 });
  let updated = null;
  if (plan) {
    updated = updateTenantPlan(tenantId, plan);
  }
  if (limits) {
    updated = updateTenantLimits(tenantId, limits);
  }
  recordAudit(req as any, user, 'tenant.update', 'tenant', tenantId, { plan: plan || null, limits: limits || null });
  return NextResponse.json({ tenant: updated });
}

export async function PUT(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { mode } = body || {};
  if (mode !== 'cleanup_empty') {
    return NextResponse.json({ message: 'Unsupported cleanup mode.' }, { status: 400 });
  }
  const db = getDb();
  const tenants = listTenants();
  const removable = tenants.filter((tenant) => tenant.id !== 'tenant_default');
  const toDelete = [] as string[];
  removable.forEach((tenant) => {
    const usage = getTenantUsage(tenant.id);
    if (usage.users === 0 && usage.projects === 0 && usage.orgs === 0) {
      toDelete.push(tenant.id);
    }
  });
  toDelete.forEach((tenantId) => {
    db.transaction(() => {
      db.prepare('DELETE FROM jobs WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM audit_logs WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM deployments WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM comparisons WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM retrievals WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM orgs WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM projects WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
    })();
  });
  recordAudit(req as any, user, 'tenant.cleanup', 'tenant', undefined, { removed: toDelete.length });
  return NextResponse.json({ message: 'Empty tenants removed.', removed: toDelete.length });
}

export async function DELETE(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { tenantId } = await req.json().catch(() => ({}));
  if (!tenantId) return NextResponse.json({ message: 'tenantId required' }, { status: 400 });
  if (tenantId === 'tenant_default') {
    return NextResponse.json({ message: 'Default tenant cannot be deleted.' }, { status: 400 });
  }
  if (tenantId === user.tenantId) {
    return NextResponse.json({ message: 'Cannot delete your active tenant.' }, { status: 400 });
  }
  const db = getDb();
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });
  const users = db.prepare('SELECT id FROM users WHERE tenant_id = ?').all(tenantId) as Array<{ id: string }>;
  users.forEach((row) => {
    try {
      const userPath = resolveUserPath(row.id);
      fs.rmSync(userPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
  });
  db.transaction(() => {
    db.prepare('DELETE FROM jobs WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM audit_logs WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM deployments WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM comparisons WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM retrievals WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM orgs WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM projects WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
  })();
  recordAudit(req as any, user, 'tenant.delete', 'tenant', tenantId, {});
  return NextResponse.json({ message: 'Tenant deleted.' });
}
