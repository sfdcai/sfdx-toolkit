import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject, getProjectByName, upsertProject, deleteProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const { name } = await req.json();
  const trimmed = String(name || '').trim();
  if (!trimmed) return NextResponse.json({ message: 'Project name is required' }, { status: 400 });
  if (!/^[a-zA-Z0-9_. -]+$/.test(trimmed)) {
    return NextResponse.json({ message: 'Project name contains invalid characters.' }, { status: 400 });
  }
  const existing = getProjectByName(user.id, trimmed);
  if (existing && existing.id !== project.id) {
    return NextResponse.json({ message: `Project "${trimmed}" already exists.` }, { status: 409 });
  }
  if (trimmed !== project.name) {
    const currentPath = resolveUserPath(user.id, 'projects', project.name);
    const nextPath = resolveUserPath(user.id, 'projects', trimmed);
    if (fs.existsSync(nextPath)) {
      return NextResponse.json({ message: 'Project folder already exists.' }, { status: 409 });
    }
    fs.renameSync(currentPath, nextPath);
  }
  const updated = upsertProject({ ...project, name: trimmed });
  projectPaths(user.id, updated.name);
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const projectPath = resolveUserPath(user.id, 'projects', project.name);
  try {
    fs.rmSync(projectPath, { recursive: true, force: true });
  } catch {
    // ignore filesystem cleanup failure
  }
  deleteProject(user.id, project.id);
  return NextResponse.json({ message: `Project ${project.name} deleted.` });
}
