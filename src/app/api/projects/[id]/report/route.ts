import fs from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('relPath') || 'deploy/logs/comparison-report.html';
  const paths = projectPaths(user.id, project.name);
  const fullPath = resolveUserPath(user.id, 'projects', project.name, relPath);
  if (!fullPath.startsWith(paths.root)) {
    return NextResponse.json({ message: 'Requested path is outside project workspace' }, { status: 400 });
  }
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ message: 'Report not found' }, { status: 404 });
  }
  const stream = fs.createReadStream(fullPath);
  const body = Readable.toWeb(stream) as ReadableStream;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}
