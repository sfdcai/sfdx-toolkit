import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { updateUserTenant } from '@/lib/store';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { userId, tenantId } = await req.json();
  if (!userId || !tenantId) {
    return NextResponse.json({ message: 'userId and tenantId are required' }, { status: 400 });
  }
  const updated = updateUserTenant(userId, tenantId);
  recordAudit(req as any, user, 'user.tenant.update', 'user', userId, { tenantId });
  return NextResponse.json({ message: 'User tenant updated', user: updated });
}
