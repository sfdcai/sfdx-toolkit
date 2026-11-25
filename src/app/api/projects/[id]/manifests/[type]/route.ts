import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';

export async function POST(req: Request, { params }: { params: { id: string; type: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const { xml } = await req.json();
  if (!['source', 'destination', 'delta'].includes(params.type)) {
    return NextResponse.json({ message: 'Unsupported manifest type' }, { status: 400 });
  }
  const paths = projectPaths(user.id, project.name);
  const manifestPath = (paths.manifests as Record<string, string>)[params.type];
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, xml || '');

  // Saving the delta (deploy) manifest redefines exactly what will be deployed, so any
  // destructive changes and generated retry artifacts left over from a previous compare/deploy
  // no longer match and must not silently ride along with the next deploy. Clear them.
  const cleared: string[] = [];
  if (params.type === 'delta') {
    const manifestDir = path.dirname(manifestPath);
    const destructive = path.join(manifestDir, 'destructiveChanges.xml');
    if (fs.existsSync(destructive)) {
      // Reversible safety net: move aside rather than hard-delete.
      fs.renameSync(destructive, path.join(manifestDir, 'destructiveChanges.xml.superseded.bak'));
      cleared.push('destructiveChanges.xml');
    }
    const STALE_ARTIFACT = /^(auto-retry-package|component-override|registry-filtered|no-empty-sharing-rules)/;
    for (const entry of fs.readdirSync(manifestDir)) {
      if (STALE_ARTIFACT.test(entry)) {
        fs.rmSync(path.join(manifestDir, entry), { force: true });
        cleared.push(entry);
      }
    }
  }

  return NextResponse.json({ message: 'Manifest saved', path: manifestPath, cleared });
}
