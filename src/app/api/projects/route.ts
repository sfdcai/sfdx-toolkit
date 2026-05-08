import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { ensureUserDirs, projectPaths } from '@/lib/path';
import { canCreateProject, getProjectByName, listProjects, upsertProject } from '@/lib/store';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(listProjects(user.id));
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { name } = await req.json();
  const trimmed = String(name || '').trim();
  if (!trimmed) return NextResponse.json({ message: 'Project name is required' }, { status: 400 });
  if (!/^[a-zA-Z0-9_. -]+$/.test(trimmed)) {
    return NextResponse.json({ message: 'Project name contains invalid characters.' }, { status: 400 });
  }
  if (getProjectByName(user.id, trimmed)) {
    return NextResponse.json({ message: `Project "${trimmed}" already exists.` }, { status: 409 });
  }
  if (user.role !== 'super_admin' && !canCreateProject(user.tenantId)) {
    return NextResponse.json({ message: 'Project limit reached for this tenant.' }, { status: 403 });
  }
  ensureUserDirs(user.id);
  const project = {
    id: '',
    userId: user.id,
    name: trimmed,
    sourceOrg: null,
    destinationOrg: null
  };
  const record = upsertProject(project as any);
  projectPaths(user.id, record.name);
  return NextResponse.json(record, { status: 201 });
}
