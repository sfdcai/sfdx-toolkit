import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { ensureSfdxProject, generateManifestFromOrg } from '@/lib/metadata';

export async function POST(req: Request, { params }: { params: { id: string; type: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  if (!['source', 'destination'].includes(params.type)) {
    return NextResponse.json({ message: 'Unsupported manifest type' }, { status: 400 });
  }
  const paths = projectPaths(user.id, project.name);
  const manifestPath = (paths.manifests as Record<string, string>)[params.type];
  const orgAlias = params.type === 'source' ? project.sourceOrg : project.destinationOrg;
  if (!orgAlias) return NextResponse.json({ message: 'Org alias not set on project' }, { status: 400 });
  const orgPath = resolveUserPath(user.id, 'orgs', orgAlias);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  const projectRoot = params.type === 'source' ? paths.source : paths.destination;
  ensureSfdxProject(projectRoot, info.apiVersion);
  const logPath = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', `manifest-${params.type}.log`);
  try {
    const result = generateManifestFromOrg(manifestPath, orgAlias, info.apiVersion, projectRoot);
    fs.writeFileSync(logPath, `COMMAND: ${result.command}\nOUTPUT: ${JSON.stringify(result.output, null, 2)}\n`, 'utf8');
    return NextResponse.json({
      message: 'Manifest generated',
      manifestPath,
      xml: result.xml,
      orgAlias,
      apiVersion: info.apiVersion || null,
      logPath: path.relative(paths.root, logPath)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manifest generation failed';
    fs.writeFileSync(logPath, `ERROR: ${message}\n`, 'utf8');
    return NextResponse.json({ message, logPath: path.relative(paths.root, logPath) }, { status: 500 });
  }
}
