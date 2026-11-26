import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const snapshotsDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'snapshots');
  if (!fs.existsSync(snapshotsDir)) {
    return NextResponse.json({ snapshots: [] });
  }

  const entries = fs.readdirSync(snapshotsDir, { withFileTypes: true });
  const snapshots = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const metaPath = path.join(snapshotsDir, e.name, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {
          return null;
        }
      }
      return { id: e.name, createdAt: new Date().toISOString() };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ snapshots });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { action = 'create', snapshotId, targetOrg = project.destinationOrg, deployId } = body;

  const snapshotsDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });

  if (action === 'create') {
    const id = `snap-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const snapPath = path.join(snapshotsDir, id);
    fs.mkdirSync(snapPath, { recursive: true });

    const meta = {
      id,
      projectId: project.id,
      projectName: project.name,
      targetOrg,
      deployId: deployId || 'manual',
      createdAt: new Date().toISOString(),
      label: `Pre-deploy snapshot for ${targetOrg}`,
    };

    fs.writeFileSync(path.join(snapPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    return NextResponse.json({
      message: 'Pre-deployment rollback snapshot created',
      snapshot: meta,
    });
  }

  if (action === 'rollback') {
    if (!snapshotId) {
      return NextResponse.json({ message: 'snapshotId is required for rollback' }, { status: 400 });
    }

    const snapPath = path.join(snapshotsDir, snapshotId);
    if (!fs.existsSync(snapPath)) {
      return NextResponse.json({ message: 'Snapshot not found' }, { status: 404 });
    }

    // Read snapshot meta
    const metaPath = path.join(snapPath, 'meta.json');
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

    return NextResponse.json({
      message: `Rollback simulated successfully to snapshot ${snapshotId}`,
      snapshot: meta,
      restoredAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ message: 'Invalid action' }, { status: 400 });
}
