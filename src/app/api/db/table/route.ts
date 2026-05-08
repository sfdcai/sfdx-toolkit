import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { tableRows } from '@/lib/db';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const name = url.searchParams.get('name') || '';
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!name) return NextResponse.json({ message: 'Table name is required' }, { status: 400 });
  const rows = tableRows(name, limit, offset);
  return NextResponse.json({ name, rows, limit, offset });
}
