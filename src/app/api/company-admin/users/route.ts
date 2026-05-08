import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { createUserInTenant, listUsersByTenant, updateUserRole } from '@/lib/store';
import { getDb } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail, isValidEmail } from '@/lib/validate';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ users: listUsersByTenant(user.tenantId) });
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const { userId, role, password } = await req.json().catch(() => ({}));
  if (!userId) {
    return NextResponse.json({ message: 'userId is required' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT id, tenant_id as tenantId, role FROM users WHERE id = ?').get(userId);
  if (!row) return NextResponse.json({ message: 'User not found' }, { status: 404 });
  if (row.tenantId !== user.tenantId) {
    return NextResponse.json({ message: 'User not in this tenant' }, { status: 403 });
  }
  if (role) {
    if (!['user', 'company_admin'].includes(role)) {
      return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
    }
    updateUserRole(userId, role);
  }
  if (password) {
    if (String(password).length < 8) {
      return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    const hash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }
  recordAudit(req as any, user, 'user.update', 'user', userId, { role: role || null, passwordChanged: Boolean(password) });
  const updated = db.prepare('SELECT id, tenant_id as tenantId, email, role FROM users WHERE id = ?').get(userId);
  return NextResponse.json({ message: 'User updated', user: updated });
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const { email, password, role } = await req.json().catch(() => ({}));
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return NextResponse.json({ message: 'email and password are required' }, { status: 400 });
  }
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ message: 'Invalid email address' }, { status: 400 });
  }
  if (role && !['user', 'company_admin'].includes(role)) {
    return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  try {
    const created = createUserInTenant(user.tenantId, normalizedEmail, hashPassword(String(password)), role || 'user');
    recordAudit(req as any, user, 'user.create', 'user', created.id, { email: created.email, role: created.role });
    return NextResponse.json({ message: 'User created', user: { id: created.id, email: created.email, role: created.role, tenantId: created.tenantId } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'User creation failed';
    return NextResponse.json({ message }, { status: 400 });
  }
}
