import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getProject } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';
import { recordAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { jobId } = await req.json().catch(() => ({}));
  const db = getDb();
  if (jobId) {
    const row = db
      .prepare(
        `SELECT c.id, c.user_id as userId, c.project_id as projectId, p.name as projectName
         FROM comparisons c
         JOIN projects p ON c.project_id = p.id
         WHERE c.id = ?`
      )
      .get(jobId);
    if (!row) return NextResponse.json({ message: 'Job not found' }, { status: 404 });
    const project = getProject(row.userId, row.projectId);
    if (project) {
      const jobDir = resolveUserPath(row.userId, 'projects', project.name, 'deploy', 'logs', 'comparisons', jobId);
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
    }
    db.prepare('DELETE FROM comparisons WHERE id = ?').run(jobId);
    recordAudit(req as any, user, 'job.clear', 'job', jobId, {});
    return NextResponse.json({ message: `Job ${jobId} removed.` });
  }
  const rows = db.prepare('SELECT id, user_id as userId, project_id as projectId FROM comparisons').all();
  rows.forEach((row: any) => {
    const project = getProject(row.userId, row.projectId);
    if (!project) return;
    const jobDir = resolveUserPath(row.userId, 'projects', project.name, 'deploy', 'logs', 'comparisons', row.id);
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
  });
  const result = db.prepare('DELETE FROM comparisons').run();
  recordAudit(req as any, user, 'job.clear_all', 'job', undefined, { deleted: result.changes });
  return NextResponse.json({ message: 'All comparison jobs cleared.', deleted: result.changes });
}
