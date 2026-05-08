import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { deleteProject, listProjectsByTenant } from '@/lib/store';
import { getDb } from '@/lib/db';
import { resolveUserPath } from '@/lib/path';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const projects = listProjectsByTenant(user.tenantId).map((project: any) => {
    const projectPath = resolveUserPath(project.userId, 'projects', project.name);
    return { ...project, bytes: folderSizeBytes(projectPath) };
  });
  return NextResponse.json({ projects });
}

export async function DELETE(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!['company_admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ message: 'projectId is required' }, { status: 400 });
  const db = getDb();
  const project = db
    .prepare('SELECT id, tenant_id as tenantId, user_id as userId, name FROM projects WHERE id = ?')
    .get(projectId) as { id: string; tenantId: string; userId: string; name: string } | undefined;
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  if (project.tenantId !== user.tenantId) {
    return NextResponse.json({ message: 'Project not in this tenant' }, { status: 403 });
  }
  const projectPath = resolveUserPath(project.userId, 'projects', project.name);
  try {
    fs.rmSync(projectPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup failure
  }
  deleteProject(project.userId, project.id);
  return NextResponse.json({ message: `Project ${project.name} deleted.` });
}

function folderSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += folderSizeBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  });
  return total;
}
