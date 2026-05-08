import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const url = new URL(req.url);
  const target = url.searchParams.get('target');
  const relPath = url.searchParams.get('relPath');
  const allowMissing = url.searchParams.get('allowMissing') === 'true';
  if (!['source', 'destination'].includes(String(target))) {
    return NextResponse.json({ message: 'Target must be source or destination' }, { status: 400 });
  }
  if (!relPath) return NextResponse.json({ message: 'relPath query is required' }, { status: 400 });
  const paths = projectPaths(user.id, project.name);
  const baseDir = path.join(paths[target as 'source' | 'destination']);
  const fullPath = path.resolve(path.join(baseDir, relPath));
  if (!fullPath.startsWith(baseDir)) {
    return NextResponse.json({ message: 'Requested path is outside project workspace' }, { status: 400 });
  }
  if (!fs.existsSync(fullPath)) {
    if (allowMissing) {
      return NextResponse.json({ relPath, target, content: '', missing: true });
    }
    return NextResponse.json({ message: 'File not found' }, { status: 404 });
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  return NextResponse.json({ relPath, target, content });
}
