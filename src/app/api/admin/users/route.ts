import fs from 'fs';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { createUserInTenant, getTenantById } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail, isValidEmail } from '@/lib/validate';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const db = getDb();
  const users = db.prepare('SELECT id, tenant_id as tenantId, email, role FROM users ORDER BY email ASC').all();
  return NextResponse.json({ users });
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { userId, role } = await req.json();
  if (!userId || !role) {
    return NextResponse.json({ message: 'userId and role are required' }, { status: 400 });
  }
  if (!['user', 'company_admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
  }
  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  recordAudit(req as any, user, 'user.role.update', 'user', userId, { role });
  return NextResponse.json({ message: 'Role updated' });
}

export async function PUT(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { userId, password } = await req.json();
  if (!userId || !password) {
    return NextResponse.json({ message: 'userId and password are required' }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  const db = getDb();
  const hash = hashPassword(String(password));
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  recordAudit(req as any, user, 'user.password.reset', 'user', userId, {});
  return NextResponse.json({ message: 'Password reset.' });
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { email, password, role, tenantId } = await req.json().catch(() => ({}));
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password || !tenantId) {
    return NextResponse.json({ message: 'email, password, and tenantId are required' }, { status: 400 });
  }
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ message: 'Invalid email address' }, { status: 400 });
  }
  if (!['user', 'company_admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
  }
  const tenant = getTenantById(tenantId);
  if (!tenant) return NextResponse.json({ message: 'Tenant not found' }, { status: 404 });
  if (String(password).length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  try {
    const created = createUserInTenant(tenantId, normalizedEmail, hashPassword(String(password)), role);
    recordAudit(req as any, user, 'user.create', 'user', created.id, { email: created.email, role, tenantId });
    return NextResponse.json({ message: 'User created', user: { id: created.id, email: created.email, role: created.role, tenantId: created.tenantId } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'User creation failed';
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ message: 'userId is required' }, { status: 400 });
  if (userId === user.id) {
    return NextResponse.json({ message: 'Cannot delete the active super admin user.' }, { status: 400 });
  }
  const db = getDb();
  db.prepare('DELETE FROM orgs WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM retrievals WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM comparisons WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM deployments WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM jobs WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM projects WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  recordAudit(req as any, user, 'user.delete', 'user', userId, {});
  try {
    const userPath = resolveUserPath(userId);
    fs.rmSync(userPath, { recursive: true, force: true });
  } catch {
    // ignore filesystem cleanup failure
  }
  return NextResponse.json({ message: 'User deleted.' });
}
