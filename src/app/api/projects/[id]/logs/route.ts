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
  const relPath = url.searchParams.get('relPath');
  if (!relPath) return NextResponse.json({ message: 'relPath query is required' }, { status: 400 });
  const paths = projectPaths(user.id, project.name);
  const baseDir = paths.root;
  const fullPath = path.resolve(path.join(baseDir, relPath));
  if (!fullPath.startsWith(baseDir)) {
    return NextResponse.json({ message: 'Requested path is outside project workspace' }, { status: 400 });
  }
  if (!fs.existsSync(fullPath)) return NextResponse.json({ message: 'Log not found' }, { status: 404 });
  const stat = fs.statSync(fullPath);
  const size = stat.size;
  const offsetRaw = url.searchParams.get('offset');
  const limitRaw = url.searchParams.get('limitBytes');
  const limitBytes = Math.max(256, Math.min(64 * 1024, Number(limitRaw || '8192') || 8192));
  const parsedOffset = offsetRaw === null ? null : Math.max(0, Number(offsetRaw) || 0);
  const start = parsedOffset === null ? Math.max(0, size - limitBytes) : Math.min(size, parsedOffset);
  const length = Math.min(limitBytes, Math.max(0, size - start));
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(fullPath, 'r');
  fs.readSync(fd, buffer, 0, length, start);
  fs.closeSync(fd);
  return NextResponse.json({
    relPath,
    content: buffer.toString('utf8'),
    startOffset: start,
    nextOffset: start + length,
    size,
    truncated: start > 0
  });
}
