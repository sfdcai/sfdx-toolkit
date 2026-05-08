import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { createUpgradeRequest } from '@/lib/store';
import { recordAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const limiter = rateLimit(`upgrade:${req.headers.get('x-forwarded-for') || 'local'}`, 5, 30 * 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json({ message: 'Too many upgrade requests. Try again later.' }, { status: 429 });
  }
  const { plan } = await req.json().catch(() => ({}));
  if (!plan || !['free', 'pro', 'enterprise'].includes(plan)) {
    return NextResponse.json({ message: 'Valid plan is required.' }, { status: 400 });
  }
  try {
    const request = createUpgradeRequest(user.tenantId, user.id, plan);
    recordAudit(req as any, user, 'plan.request', 'upgrade_request', request.id, { requestedPlan: plan });
    return NextResponse.json({ message: 'Upgrade request submitted.', request }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upgrade request failed';
    recordAudit(req as any, user, 'plan.request_failed', 'upgrade_request', undefined, { requestedPlan: plan, reason: message });
    return NextResponse.json({ message }, { status: 400 });
  }
}
