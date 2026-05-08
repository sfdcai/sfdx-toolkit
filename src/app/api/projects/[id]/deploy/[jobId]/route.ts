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
  const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'deployments', params.jobId);
  const statusPath = path.join(jobDir, 'job-status.json');
  if (!statusPath.startsWith(paths.root)) {
    return NextResponse.json({ message: 'Requested path is outside project workspace' }, { status: 400 });
  }
  if (!fs.existsSync(statusPath)) {
    return NextResponse.json({ message: 'Deployment job not found' }, { status: 404 });
  }
  const payload = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  return NextResponse.json(payload);
}
