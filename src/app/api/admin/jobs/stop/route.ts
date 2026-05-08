import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getProject, updateComparison } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';
import { recordAudit } from '@/lib/audit';

function writeJson(filePath: string, payload: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { jobId } = await req.json();
  if (!jobId) return NextResponse.json({ message: 'jobId is required' }, { status: 400 });
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.id,
              c.user_id as userId,
              c.project_id as projectId,
              p.name as projectName
       FROM comparisons c
       JOIN projects p ON c.project_id = p.id
       WHERE c.id = ?`
    )
    .get(jobId);
  if (!row) return NextResponse.json({ message: 'Job not found' }, { status: 404 });
  const project = getProject(row.userId, row.projectId);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const jobDir = resolveUserPath(row.userId, 'projects', project.name, 'deploy', 'logs', 'comparisons', jobId);
  const statusPath = path.join(jobDir, 'job-status.json');
  const now = new Date().toISOString();
  let status = {
    jobId,
    projectId: row.projectId,
    userId: row.userId,
    status: 'canceled',
    cancelRequested: true,
    updatedAt: now,
    stages: []
  } as any;
  if (fs.existsSync(statusPath)) {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    status.cancelRequested = true;
    status.status = status.status === 'done' ? status.status : 'canceled';
    status.updatedAt = now;
    status.canceledAt = now;
  }
  writeJson(statusPath, status);
  const retrieveStatusFiles = ['source-retrieve-status.json', 'destination-retrieve-status.json'];
  retrieveStatusFiles.forEach((file) => {
    const retrievePath = path.join(jobDir, file);
    if (fs.existsSync(retrievePath)) {
      const payload = JSON.parse(fs.readFileSync(retrievePath, 'utf8'));
      payload.cancelRequested = true;
      payload.updatedAt = now;
      writeJson(retrievePath, payload);
    }
  });
  updateComparison(jobId, { jobStatus: status, completedAt: status.status === 'canceled' ? now : status.completedAt });
  recordAudit(req as any, user, 'job.stop', 'job', jobId, { projectId: row.projectId });
  return NextResponse.json({ message: `Cancel requested for job ${jobId}.` });
}
