import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getAdminSettings, setAdminSettings } from '@/lib/store';
import { recordAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  return NextResponse.json(getAdminSettings());
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { defaultTenantPlan, defaultTenantId } = await req.json().catch(() => ({}));
  const updated = setAdminSettings({ defaultTenantPlan, defaultTenantId });
  recordAudit(req as any, user, 'settings.update', 'settings', undefined, {
    defaultTenantPlan: defaultTenantPlan || null,
    defaultTenantId: defaultTenantId ?? null
  });
  return NextResponse.json(updated);
}
