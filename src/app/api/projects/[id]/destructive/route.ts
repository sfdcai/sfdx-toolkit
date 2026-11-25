import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';
import { parseManifestComponents } from '@/lib/metadata';

// Returns the pending destructive deletions (from deploy/manifest/destructiveChanges.xml)
// so the deploy UI can warn before a delta deploy removes components from the target org.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const paths = projectPaths(user.id, project.name);
  const destructivePath = path.join(paths.deploy, 'manifest', 'destructiveChanges.xml');
  if (!fs.existsSync(destructivePath)) {
    return NextResponse.json({ components: [], count: 0 });
  }

  let components: { name: string; members: string[] }[] = [];
  try {
    components = parseManifestComponents(fs.readFileSync(destructivePath, 'utf8'));
  } catch {
    components = [];
  }
  const count = components.reduce((sum, c) => sum + (c.members?.length || 0), 0);
  return NextResponse.json({ components, count });
}
