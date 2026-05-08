import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';

function usageWindowStartUtc(days: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1), 0, 0, 0));
  return start.toISOString();
}

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const db = getDb();
  const start = usageWindowStartUtc(30);
  const retrieves = db
    .prepare("SELECT substr(created_at, 1, 10) as day, COUNT(*) as count FROM retrievals WHERE created_at >= ? GROUP BY day")
    .all(start) as Array<{ day: string; count: number }>;
  const deploys = db
    .prepare("SELECT substr(created_at, 1, 10) as day, COUNT(*) as count FROM deployments WHERE created_at >= ? GROUP BY day")
    .all(start) as Array<{ day: string; count: number }>;
  const map = new Map<string, { retrieves: number; deploys: number }>();
  retrieves.forEach((row) => map.set(row.day, { retrieves: row.count, deploys: 0 }));
  deploys.forEach((row) => {
    const existing = map.get(row.day) || { retrieves: 0, deploys: 0 };
    existing.deploys = row.count;
    map.set(row.day, existing);
  });
  const series = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ day, ...value }));
  return NextResponse.json({ series, start });
}
