import fs from 'fs';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import path from 'path';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { generateDeltaManifest, generateDestructiveChanges, ensureSfdxProject } from '@/lib/metadata';
import { filterManifestXmlByRegistry } from '@/lib/manifest-filter';
import { stageDeltaFiles } from '@/lib/deploy';

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
  
  const deltaXmlRaw = generateDeltaManifest(paths.manifests.delta, changes, paths.source);
  const filteredDelta = await filterManifestXmlByRegistry(deltaXmlRaw);
  const deltaXml = filteredDelta.xml;
  fs.writeFileSync(paths.manifests.delta, deltaXml, 'utf8');
  
  const destructiveXmlRaw = generateDestructiveChanges(path.join(paths.deploy, 'manifest', 'destructiveChanges.xml'), changes);
  let destructiveXml = destructiveXmlRaw;
  if (destructiveXmlRaw) {
    const filteredDestructive = await filterManifestXmlByRegistry(destructiveXmlRaw);
    destructiveXml = filteredDestructive.xml;
    filteredDestructive.skippedTypes.forEach((t) => {
      if (!filteredDelta.skippedTypes.includes(t)) filteredDelta.skippedTypes.push(t);
    });
    fs.writeFileSync(path.join(paths.deploy, 'manifest', 'destructiveChanges.xml'), destructiveXml, 'utf8');
  }

  // 1. Ensure deploy directory is a valid SFDX workspace with standard config
  const orgPath = project.destinationOrg ? resolveUserPath(user.id, 'orgs', project.destinationOrg) : '';
  const infoPath = orgPath && path.join(orgPath, 'org-info.json');
  const info = infoPath && fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  ensureSfdxProject(paths.deploy, info.apiVersion);

  // 2. Clear out any existing delta metadata in deploy/force-app to prevent stale components
  const forceAppDir = path.join(paths.deploy, 'force-app');
  if (fs.existsSync(forceAppDir)) {
    fs.rmSync(forceAppDir, { recursive: true, force: true });
  }
  fs.mkdirSync(forceAppDir, { recursive: true });

  // 3. Stage / copy the physical metadata files to the deploy/force-app folder
  let copiedCount = 0;
  let missingCount = 0;
  let missingList: string[] = [];
  if (selection.length) {
    const stageResult = stageDeltaFiles(paths.source, paths.deploy, selection, paths.destination);
    copiedCount = stageResult.copied;
    missingCount = stageResult.missing;
    missingList = stageResult.missingList;
  }

  return NextResponse.json({
    message: 'Delta manifest updated and files staged',
    deltaXml,
    destructiveXml,
    selectedCount,
    selectionCount: selection.length,
    copiedCount,
    missingCount,
    missingList,
    skippedUnsupportedTypes: filteredDelta.skippedTypes,
    warnings: filteredDelta.warnings,
    registryPath: filteredDelta.registryPath
  });
}
