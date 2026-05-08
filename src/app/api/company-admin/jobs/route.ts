import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id,
              c.user_id as userId,
              c.project_id as projectId,
              c.job_status_json as jobStatusJson,
              c.created_at as createdAt,
              c.report_rel_path as reportRelPath,
              p.name as projectName,
              u.email as email,
              u.tenant_id as tenantId
       FROM comparisons c
       JOIN projects p ON c.project_id = p.id
       JOIN users u ON c.user_id = u.id
       WHERE u.tenant_id = ?
       ORDER BY c.created_at DESC
       LIMIT 50`
    )
    .all(user.tenantId);
  const jobs = rows.map((row: any) => {
    const status = row.jobStatusJson ? JSON.parse(row.jobStatusJson) : null;
    return {
      id: row.id,
      userId: row.userId,
      projectId: row.projectId,
      projectName: row.projectName,
      email: row.email,
      status: status?.status || 'unknown',
      createdAt: row.createdAt,
      reportRelPath: row.reportRelPath || null
    };
  });
  return NextResponse.json({ jobs });
}
