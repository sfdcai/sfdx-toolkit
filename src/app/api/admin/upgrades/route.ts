import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { listUpgradeRequests, resolveUpgradeRequest } from '@/lib/store';
import { recordAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ requests: listUpgradeRequests() });
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { requestId, action } = await req.json().catch(() => ({}));
  if (!requestId || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ message: 'requestId and valid action are required' }, { status: 400 });
  }
  const resolved = resolveUpgradeRequest(requestId, action);
  if (!resolved) return NextResponse.json({ message: 'Request not found' }, { status: 404 });
  recordAudit(req as any, user, `plan.request.${action}`, 'upgrade_request', requestId, {});
  return NextResponse.json({ message: 'Request updated', request: resolved });
}
