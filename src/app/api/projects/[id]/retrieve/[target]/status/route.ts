import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { id: string; target: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  if (!['source', 'destination'].includes(params.target)) {
    return NextResponse.json({ message: 'Project or target not found' }, { status: 404 });
  }
  const target = params.target === 'source' ? 'source' : 'destination';
  const paths = projectPaths(user.id, project.name);
  const folder = target === 'source' ? paths.source : paths.destination;
  const statusPath = path.join(folder, 'logs', `${target}-retrieve-status.json`);
  if (!fs.existsSync(statusPath)) {
    return NextResponse.json({ message: 'Retrieve status not found' }, { status: 404 });
  }
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  return NextResponse.json(status);
}
