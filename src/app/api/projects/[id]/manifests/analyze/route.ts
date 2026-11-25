import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { sanitizeMetadataContent } from '@/lib/deploy';
import { projectPaths } from '@/lib/path';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const relPath = typeof body?.relPath === 'string' ? body.relPath : '';
  const content = typeof body?.content === 'string' ? body.content : '';

  if (!relPath || !content) {
    return NextResponse.json({ message: 'relPath and content are required' }, { status: 400 });
  }

  const paths = projectPaths(user.id, project.name);
  const logLines: string[] = [];
  
  try {
    const sanitized = sanitizeMetadataContent(relPath, content, paths.source, paths.destination, logLines);
    
    return NextResponse.json({
      message: 'Analysis complete',
      relPath,
      healedContent: sanitized,
      changes: logLines,
      isModified: sanitized !== content
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ message }, { status: 500 });
  }
}
