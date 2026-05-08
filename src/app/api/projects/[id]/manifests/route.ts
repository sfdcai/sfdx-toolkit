import fs from 'fs';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const paths = projectPaths(user.id, project.name);
  const read = (filePath: string) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '');
  return NextResponse.json({
    source: read(paths.manifests.source),
    destination: read(paths.manifests.destination),
    delta: read(paths.manifests.delta)
  });
}
