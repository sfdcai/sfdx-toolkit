import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { reapplyApprovedUpgrades } from '@/lib/store';
import { recordAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const result = reapplyApprovedUpgrades();
  recordAudit(req as any, user, 'plan.request.sync', 'upgrade_request', undefined, result);
  return NextResponse.json({ message: 'Approved upgrades reapplied', ...result });
}
