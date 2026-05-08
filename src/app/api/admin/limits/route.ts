import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getPlanLimits, setPlanLimits } from '@/lib/store';
import { recordAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ limits: getPlanLimits() });
}

export async function PATCH(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { limits } = await req.json();
  if (!limits) return NextResponse.json({ message: 'limits payload required' }, { status: 400 });
  const updated = setPlanLimits(limits);
  recordAudit(req as any, user, 'plan.limits.update', 'settings', undefined, {});
  return NextResponse.json({ message: 'Plan limits updated', limits: updated });
}
