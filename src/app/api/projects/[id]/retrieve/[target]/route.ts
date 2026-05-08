import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { canRunRetrieve, getProject, saveRetrieval } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { buildChunkManifests, buildGroupedManifests, ensureSfdxProject, parseManifestComponents, runRetrieveChunked, type RetrieveMode } from '@/lib/metadata';

export async function POST(req: Request, { params }: { params: { id: string; target: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin' && !canRunRetrieve(user.tenantId)) {
    return NextResponse.json({ message: 'Retrieve limit reached for this tenant.' }, { status: 403 });
  }
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  if (!['source', 'destination'].includes(params.target)) {
    return NextResponse.json({ message: 'Project or target not found' }, { status: 404 });
  }
  const target = params.target === 'source' ? 'source' : 'destination';
  const orgAlias = target === 'source' ? project.sourceOrg : project.destinationOrg;
  if (!orgAlias) return NextResponse.json({ message: 'Org alias not set on project' }, { status: 400 });
  const { manifestXml, retrieveMode } = await req.json().catch(() => ({ manifestXml: null, retrieveMode: 'chunked' }));
  const paths = projectPaths(user.id, project.name);
  const manifestPath = target === 'source' ? paths.manifests.source : paths.manifests.destination;
  let xml = manifestXml;
  if (!xml) {
    if (!fs.existsSync(manifestPath)) {
      return NextResponse.json({ message: 'Manifest not found. Generate or paste a manifest first.' }, { status: 400 });
    }
    xml = fs.readFileSync(manifestPath, 'utf8');
  }
  const components = parseManifestComponents(xml || '');
  if (!components.length) {
    return NextResponse.json({ message: 'Manifest does not contain any types' }, { status: 400 });
  }
  const orgPath = resolveUserPath(user.id, 'orgs', orgAlias);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  const folder = target === 'source' ? paths.source : paths.destination;
  ensureSfdxProject(folder, info.apiVersion);
  const logPath = path.join(folder, 'logs', `${target}-retrieve.log`);
  const statusPath = path.join(folder, 'logs', `${target}-retrieve-status.json`);
  const selectedMode: RetrieveMode = retrieveMode === 'grouped' ? 'grouped' : 'chunked';
  const { entries, chunkManifests } = selectedMode === 'grouped'
    ? buildGroupedManifests({ outputDir: folder, types: components })
    : buildChunkManifests({ outputDir: folder, types: components });
  const statusPayload = {
    target,
    retrieveMode: selectedMode,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    done: false,
    entries,
    outputs: [],
    chunkManifests
  };
  fs.writeFileSync(statusPath, JSON.stringify(statusPayload, null, 2), 'utf8');
  fs.writeFileSync(logPath, `Retrieve queued ${new Date().toISOString()}\n`, 'utf8');
  void runRetrieveChunked({
    targetLabel: target,
    targetOrg: orgAlias,
    outputDir: folder,
    apiVersion: info.apiVersion,
    logPath,
    statusPath,
    chunkManifests
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    fs.appendFileSync(logPath, `FATAL: ${message}\n`, 'utf8');
  });
  const record = saveRetrieval({
    userId: user.id,
    tenantId: project.tenantId,
    projectId: project.id,
    target,
    logPath,
    count: entries.length
  });
  const relativeChunks = chunkManifests.map((item) => ({
    type: item.type,
    types: item.types,
    label: item.label,
    mode: item.mode,
    path: path.relative(paths.root, item.path)
  }));
  return NextResponse.json({
    message: `Retrieval started for ${target} using ${selectedMode} mode`,
    retrieveMode: selectedMode,
    logPath: path.relative(paths.root, logPath),
    entries,
    record,
    chunkManifests: relativeChunks
  });
}
