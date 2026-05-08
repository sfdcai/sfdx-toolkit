import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const db = getDb();
  const users = db
    .prepare('SELECT id, tenant_id as tenantId, email, role FROM users ORDER BY email ASC')
    .all();
  const projects = db
    .prepare(
      'SELECT id, tenant_id as tenantId, user_id as userId, name, source_org as sourceOrg, destination_org as destinationOrg FROM projects ORDER BY name ASC'
    )
    .all();
  const orgs = db
    .prepare('SELECT id, tenant_id as tenantId, user_id as userId, alias, info_json as infoJson FROM orgs ORDER BY alias ASC')
    .all()
    .map((org: any) => ({
      ...org,
      info: org.infoJson ? JSON.parse(org.infoJson) : {}
    }));
  return NextResponse.json({ users, projects, orgs });
}
