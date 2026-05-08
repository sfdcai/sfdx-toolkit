import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { listTables } from '@/lib/db';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ tables: listTables() });
}
