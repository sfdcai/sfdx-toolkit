import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject, listAgentRunsForProject } from '@/lib/store';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const runs = listAgentRunsForProject(project.id);
  return NextResponse.json({ runs });
}
