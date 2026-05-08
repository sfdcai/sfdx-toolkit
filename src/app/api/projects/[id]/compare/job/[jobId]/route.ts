import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { id: string; jobId: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const paths = projectPaths(user.id, project.name);
  const jobDir = resolveUserPath(
    user.id,
    'projects',
    project.name,
    'deploy',
    'logs',
    'comparisons',
    params.jobId
  );
  const statusPath = resolveUserPath(
    user.id,
    'projects',
    project.name,
    'deploy',
    'logs',
    'comparisons',
    params.jobId,
    'job-status.json'
  );
  if (!statusPath.startsWith(paths.root)) {
    return NextResponse.json({ message: 'Requested path is outside project workspace' }, { status: 400 });
  }
  const logPath = path.join(jobDir, 'job.log');
  let logTail = null as string | null;
  if (fs.existsSync(logPath)) {
    const stat = fs.statSync(logPath);
    const size = stat.size;
    const readSize = Math.min(size, 8192);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buffer, 0, readSize, size - readSize);
    fs.closeSync(fd);
    logTail = buffer.toString('utf8');
  }
  if (!fs.existsSync(statusPath)) {
    return NextResponse.json({ message: 'Job not found' }, { status: 404 });
  }
  const payload = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const reportRelPath = payload?.outputs?.reportRelPath || null;
  return NextResponse.json({ ...payload, reportRelPath, logTail });
}
