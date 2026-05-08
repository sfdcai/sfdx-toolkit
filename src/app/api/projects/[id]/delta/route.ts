import fs from 'fs';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import path from 'path';
import { projectPaths } from '@/lib/path';
import { generateDeltaManifest, generateDestructiveChanges } from '@/lib/metadata';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const { changes = [] } = await req.json().catch(() => ({ changes: [] }));
  if (!Array.isArray(changes) || !changes.length) {
    return NextResponse.json({ message: 'No changes selected' }, { status: 400 });
  }
  const paths = projectPaths(user.id, project.name);
  const selectionPath = path.join(paths.deploy, 'selection.json');
  const selectedCount = changes.length;
  const included = changes.filter((item: any) => item.status === 'Added' || item.status === 'Changed');
  const selection = included.map((item: any) => item.relPath).filter(Boolean);
  fs.writeFileSync(selectionPath, JSON.stringify({ updatedAt: new Date().toISOString(), selection }, null, 2), 'utf8');
  const deltaXml = generateDeltaManifest(paths.manifests.delta, changes);
  const destructiveXml = generateDestructiveChanges(path.join(paths.deploy, 'manifest', 'destructiveChanges.xml'), changes);
  return NextResponse.json({
    message: 'Delta manifest updated',
    deltaXml,
    destructiveXml,
    selectedCount,
    selectionCount: selection.length
  });
}
