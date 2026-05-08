import fs from 'fs';
import path from 'path';
import crypto from "crypto";
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject, saveComparison } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { diffWorkspaces, generateDeltaManifest, generateDestructiveChanges, writeComparisonCsv, writeComparisonHtmlReport } from '@/lib/metadata';
import { filterManifestXmlByRegistry } from '@/lib/manifest-filter';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const paths = projectPaths(user.id, project.name);
  const changes = diffWorkspaces(paths.source, paths.destination);
  const jobId = crypto.randomUUID().replace(/-/g,"").substring(0, 16);
  const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'comparisons', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const diffLog = path.join(jobDir, 'comparison.csv');
  writeComparisonCsv(diffLog, changes);
  const reportPath = path.join(jobDir, 'comparison-report.html');
  writeComparisonHtmlReport(reportPath, {
    projectId: project.id,
    projectName: project.name,
    sourceOrg: project.sourceOrg,
    destinationOrg: project.destinationOrg,
    changes
  });
  const reportRelPath = path.relative(paths.root, reportPath);
  const deltaManifest = paths.manifests.delta;
  const destructiveManifest = path.join(paths.deploy, 'manifest', 'destructiveChanges.xml');
  const deltaXmlRaw = generateDeltaManifest(deltaManifest, changes);
  const filteredDelta = filterManifestXmlByRegistry(deltaXmlRaw);
  const deltaXml = filteredDelta.xml;
  fs.writeFileSync(deltaManifest, deltaXml, 'utf8');
  const destructiveXml = generateDestructiveChanges(destructiveManifest, changes);
  const deltaSnapshot = path.join(jobDir, 'delta-package.xml');
  const destructiveSnapshot = path.join(jobDir, 'destructiveChanges.xml');
  fs.writeFileSync(deltaSnapshot, deltaXml, 'utf8');
  if (destructiveXml) {
    fs.writeFileSync(destructiveSnapshot, destructiveXml, 'utf8');
  }
  const record = saveComparison({
    id: jobId,
    tenantId: project.tenantId,
    userId: user.id,
    projectId: project.id,
    diffLog,
    reportPath,
    reportRelPath,
    deltaManifest: deltaSnapshot,
    destructiveManifest: destructiveXml ? destructiveSnapshot : null,
    manifestStrategy: 'workspace_diff',
    sourceOrg: project.sourceOrg,
    destinationOrg: project.destinationOrg,
    changes
  });
  return NextResponse.json({
    message: 'Comparison generated',
    diffLog,
    reportPath,
    reportRelPath,
    deltaManifest,
    destructiveManifest,
    deltaXml,
    destructiveXml,
    skippedUnsupportedTypes: filteredDelta.skippedTypes,
    registryPath: filteredDelta.registryPath,
    changes,
    jobId,
    record
  });
}
