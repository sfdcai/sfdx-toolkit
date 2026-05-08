import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { deleteProject, getProject } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';
import { recordAudit } from '@/lib/audit';

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

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT p.id, p.name, p.user_id as userId, p.source_org as sourceOrg, p.destination_org as destinationOrg, u.email as email FROM projects p JOIN users u ON p.user_id = u.id'
    )
    .all();
  const projects = rows.map((row: any) => {
    const projectPath = resolveUserPath(row.userId, 'projects', row.name);
    const bytes = folderSizeBytes(projectPath);
    return { ...row, bytes };
  });
  return NextResponse.json({ projects });
}

export async function DELETE(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { projectId, userId } = await req.json();
  if (!projectId || !userId) {
    return NextResponse.json({ message: 'projectId and userId are required' }, { status: 400 });
  }
  const project = getProject(userId, projectId);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const projectPath = resolveUserPath(userId, 'projects', project.name);
  try {
    fs.rmSync(projectPath, { recursive: true, force: true });
  } catch {
    // ignore filesystem cleanup failure
  }
  deleteProject(userId, project.id);
  recordAudit(req as any, user, 'project.delete', 'project', project.id, { name: project.name, userId });
  return NextResponse.json({ message: `Project ${project.name} deleted.` });
}
