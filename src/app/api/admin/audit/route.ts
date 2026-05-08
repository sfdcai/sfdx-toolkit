import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { listAuditLogs } from '@/lib/store';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  return NextResponse.json({ logs: listAuditLogs(limit) });
}
