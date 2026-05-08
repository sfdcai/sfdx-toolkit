import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';

export async function POST(req: Request, { params }: { params: { id: string; type: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const { xml } = await req.json();
  if (!['source', 'destination', 'delta'].includes(params.type)) {
    return NextResponse.json({ message: 'Unsupported manifest type' }, { status: 400 });
  }
  const paths = projectPaths(user.id, project.name);
  const manifestPath = (paths.manifests as Record<string, string>)[params.type];
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, xml || '');
  return NextResponse.json({ message: 'Manifest saved', path: manifestPath });
}
