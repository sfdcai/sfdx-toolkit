import fs from 'fs';
import path from 'path';
import {
  buildChunkManifests,
  buildPackageXml,
  diffWorkspaces,
  ensureSfdxProject,
  generateDeltaManifest,
  generateDestructiveChanges,
  generateManifestFromOrg,
  parseManifestComponents,
  runRetrieveChunked,
  writeComparisonCsv,
  writeComparisonHtmlReport
} from './metadata';
import { getProject, listComparisons, updateComparison, JobRecord } from './store';
import { projectPaths, resolveUserPath } from './path';

export type ManifestScope = {
  includeTypes?: string[];
  excludeTypes?: string[];
  excludeProfiles?: boolean;
  customOnly?: boolean;
  businessOnly?: boolean;
};

export type CompareJobPayload = {
  jobId: string;
  manifestStrategy?: 'existing' | 'auto' | 'custom' | 'merge' | 'scope' | 'delta';
  manifestXml?: string;
  mergeManifests?: string[];
  scope?: ManifestScope;
  context?: {
    branch?: string;
    release?: string;
    reason?: string;
  };
};

function mergeManifestTypes(manifests: string[]) {
  const merged = new Map<string, Set<string>>();
  manifests.forEach((xml) => {
    parseManifestComponents(xml).forEach((type) => {
      const set = merged.get(type.name) || new Set<string>();
      type.members.forEach((member) => set.add(member));
      merged.set(type.name, set);
    });
  });
  return Array.from(merged.entries()).map(([name, members]) => ({
    name,
    members: members.has('*') ? ['*'] : Array.from(members)
  }));
}

function applyScope(types: { name: string; members: string[] }[], scope: ManifestScope) {
  let next = [...types];
  if (scope.includeTypes?.length) {
    const allow = new Set(scope.includeTypes.map((t) => t.trim()).filter(Boolean));
    next = next.filter((type) => allow.has(type.name));
  }
  if (scope.excludeTypes?.length) {
    const deny = new Set(scope.excludeTypes.map((t) => t.trim()).filter(Boolean));
    next = next.filter((type) => !deny.has(type.name));
  }
  if (scope.excludeProfiles) {
    next = next.filter((type) => type.name !== 'Profile');
  }
  if (scope.customOnly) {
    next = next.filter((type) => type.name.includes('Custom') || ['ApexClass', 'ApexTrigger', 'Flow'].includes(type.name));
  }
  if (scope.businessOnly) {
    const business = new Set([
      'Flow',
      'ValidationRule',
      'ApexClass',
      'ApexTrigger',
      'CustomObject',
      'CustomField',
      'RecordType',
      'Layout',
      'Workflow',
      'SharingRules',
      'PermissionSet',
      'Profile'
    ]);
    next = next.filter((type) => business.has(type.name));
  }
  return next;
}

function readManifestFile(manifestPath: string) {
  if (!fs.existsSync(manifestPath)) return '';
  return fs.readFileSync(manifestPath, 'utf8');
}

function writeStatus(statusPath: string, payload: Record<string, unknown>) {
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), 'utf8');
}

function appendJobLog(logPath: string, message: string) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function copySnapshot(targetDir: string, snapshotDir: string, manifestXml: string, meta: Record<string, unknown>) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  const srcForceApp = path.join(targetDir, 'force-app');
  const destForceApp = path.join(snapshotDir, 'force-app');
  if (fs.existsSync(srcForceApp)) {
    fs.cpSync(srcForceApp, destForceApp, { recursive: true });
  }
  const manifestPath = path.join(snapshotDir, 'manifest', 'package.xml');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, manifestXml, 'utf8');
  fs.writeFileSync(path.join(snapshotDir, 'snapshot.json'), JSON.stringify(meta, null, 2), 'utf8');
}

export async function runCompareJob(job: JobRecord) {
  const payload = job.payload as CompareJobPayload;
  const project = getProject(job.userId, job.projectId);
  if (!project) {
    throw new Error('Project not found for comparison job.');
  }
  if (!project.sourceOrg || !project.destinationOrg) {
    throw new Error('Source and destination orgs must be set before comparing.');
  }
  const manifestStrategy = payload.manifestStrategy || 'existing';
  const paths = projectPaths(job.userId, project.name);
  const jobDir = resolveUserPath(job.userId, 'projects', project.name, 'deploy', 'logs', 'comparisons', job.id);
  fs.mkdirSync(jobDir, { recursive: true });
  const jobLogPath = path.join(jobDir, 'job.log');
  if (!fs.existsSync(jobLogPath)) {
    fs.writeFileSync(jobLogPath, `Job ${job.id} started ${new Date().toISOString()}\n`, 'utf8');
  }
  const statusPath = path.join(jobDir, 'job-status.json');
  const diffLog = path.join(jobDir, 'comparison.csv');
  const reportPath = path.join(jobDir, 'comparison-report.html');
  const reportRelPath = path.relative(paths.root, reportPath);
  const deltaSnapshot = path.join(jobDir, 'delta-package.xml');
  const destructiveSnapshot = path.join(jobDir, 'destructiveChanges.xml');

  const jobStatus: any = fs.existsSync(statusPath)
    ? JSON.parse(fs.readFileSync(statusPath, 'utf8'))
    : {
        jobId: job.id,
        projectId: project.id,
        userId: job.userId,
        startedAt: new Date().toISOString(),
        status: 'running',
        manifestStrategy,
        stages: [{ name: 'context', status: 'running', startedAt: new Date().toISOString() }],
        outputs: {}
      };

  const updateStage = (name: string, status: 'running' | 'done' | 'failed', details?: string) => {
    const existing = jobStatus.stages.find((stage: any) => stage.name === name);
    const now = new Date().toISOString();
    if (existing) {
      existing.status = status;
      existing.updatedAt = now;
      if (status !== 'running') existing.completedAt = now;
      if (details) existing.details = details;
    } else {
      jobStatus.stages.push({ name, status, startedAt: now, completedAt: status !== 'running' ? now : null, details });
    }
    jobStatus.updatedAt = now;
    writeStatus(statusPath, jobStatus);
    updateComparison(job.id, { jobStatus });
    appendJobLog(jobLogPath, `${name} ${status}${details ? ` - ${details}` : ''}`);
  };

  try {
    updateStage('context', 'done');
    updateStage('manifest_strategy', 'running');

    const orgRoot = resolveUserPath(job.userId, 'orgs');
    const sourceOrgPath = project.sourceOrg ? path.join(orgRoot, project.sourceOrg) : '';
    const destOrgPath = project.destinationOrg ? path.join(orgRoot, project.destinationOrg) : '';
    const sourceInfo = sourceOrgPath && fs.existsSync(path.join(sourceOrgPath, 'org-info.json'))
      ? JSON.parse(fs.readFileSync(path.join(sourceOrgPath, 'org-info.json'), 'utf8'))
      : {};
    const destInfo = destOrgPath && fs.existsSync(path.join(destOrgPath, 'org-info.json'))
      ? JSON.parse(fs.readFileSync(path.join(destOrgPath, 'org-info.json'), 'utf8'))
      : {};

    let sourceManifestXml = '';
    let destManifestXml = '';

    if (manifestStrategy === 'custom' && payload.manifestXml) {
      sourceManifestXml = payload.manifestXml;
      destManifestXml = payload.manifestXml;
    } else if (manifestStrategy === 'merge' && payload.mergeManifests?.length) {
      const merged = mergeManifestTypes(payload.mergeManifests);
      sourceManifestXml = buildPackageXml(merged);
      destManifestXml = sourceManifestXml;
    } else if (manifestStrategy === 'delta') {
      const recent = listComparisons(job.userId, project.id)[0];
      const changes = Array.isArray(recent?.changes) ? recent.changes : [];
      if (changes.length) {
        const tempPath = path.join(jobDir, 'delta-manifest.xml');
        const deltaXml = generateDeltaManifest(tempPath, changes as any[]);
        sourceManifestXml = deltaXml || '';
        destManifestXml = deltaXml || '';
      }
    }

    if (manifestStrategy === 'auto') {
      ensureSfdxProject(paths.source, sourceInfo.apiVersion);
      ensureSfdxProject(paths.destination, destInfo.apiVersion);
      const sourceGen = generateManifestFromOrg(paths.manifests.source, project.sourceOrg, sourceInfo.apiVersion, paths.source);
      const destGen = generateManifestFromOrg(paths.manifests.destination, project.destinationOrg, destInfo.apiVersion, paths.destination);
      sourceManifestXml = sourceGen.xml || '';
      destManifestXml = destGen.xml || '';
    } else if (!sourceManifestXml || !destManifestXml) {
      const existingSource = readManifestFile(paths.manifests.source);
      const existingDest = readManifestFile(paths.manifests.destination);
      if (manifestStrategy === 'existing' || (manifestStrategy === 'scope' && (existingSource || existingDest))) {
        sourceManifestXml = existingSource || existingDest;
        destManifestXml = existingDest || existingSource;
      } else {
        ensureSfdxProject(paths.source, sourceInfo.apiVersion);
        ensureSfdxProject(paths.destination, destInfo.apiVersion);
        const sourceGen = project.sourceOrg
          ? generateManifestFromOrg(paths.manifests.source, project.sourceOrg, sourceInfo.apiVersion, paths.source)
          : { xml: '' };
        const destGen = project.destinationOrg
          ? generateManifestFromOrg(paths.manifests.destination, project.destinationOrg, destInfo.apiVersion, paths.destination)
          : { xml: '' };
        sourceManifestXml = sourceGen.xml || '';
        destManifestXml = destGen.xml || '';
      }
    }

    if (manifestStrategy === 'scope' && payload.scope) {
      const scopedSource = applyScope(parseManifestComponents(sourceManifestXml), payload.scope);
      const scopedDest = applyScope(parseManifestComponents(destManifestXml), payload.scope);
      sourceManifestXml = buildPackageXml(scopedSource);
      destManifestXml = buildPackageXml(scopedDest);
    }

    if (!sourceManifestXml || !destManifestXml) {
      throw new Error('Manifest strategy did not produce a manifest.');
    }

    fs.mkdirSync(path.dirname(paths.manifests.source), { recursive: true });
    fs.mkdirSync(path.dirname(paths.manifests.destination), { recursive: true });
    fs.writeFileSync(paths.manifests.source, sourceManifestXml, 'utf8');
    fs.writeFileSync(paths.manifests.destination, destManifestXml, 'utf8');
    updateStage('manifest_strategy', 'done');

    updateStage('retrieve_source', 'running');
    const sourceTypes = parseManifestComponents(sourceManifestXml);
    ensureSfdxProject(paths.source, sourceInfo.apiVersion);
    const sourceLogsDir = path.join(paths.source, 'logs');
    fs.mkdirSync(sourceLogsDir, { recursive: true });
    const sourceLogPath = path.join(sourceLogsDir, `source-retrieve-${job.id}.log`);
    const sourceStatusPath = path.join(jobDir, 'source-retrieve-status.json');
    const sourceChunk = buildChunkManifests({ outputDir: paths.source, types: sourceTypes });
    writeStatus(sourceStatusPath, { ...sourceChunk, done: false });
    await runRetrieveChunked({
      targetLabel: 'source',
      targetOrg: project.sourceOrg || '',
      outputDir: paths.source,
      apiVersion: sourceInfo.apiVersion,
      logPath: sourceLogPath,
      statusPath: sourceStatusPath,
      chunkManifests: sourceChunk.chunkManifests
    });
    updateStage('retrieve_source', 'done');

    updateStage('retrieve_destination', 'running');
    const destTypes = parseManifestComponents(destManifestXml);
    ensureSfdxProject(paths.destination, destInfo.apiVersion);
    const destLogsDir = path.join(paths.destination, 'logs');
    fs.mkdirSync(destLogsDir, { recursive: true });
    const destLogPath = path.join(destLogsDir, `destination-retrieve-${job.id}.log`);
    const destStatusPath = path.join(jobDir, 'destination-retrieve-status.json');
    const destChunk = buildChunkManifests({ outputDir: paths.destination, types: destTypes });
    writeStatus(destStatusPath, { ...destChunk, done: false });
    await runRetrieveChunked({
      targetLabel: 'destination',
      targetOrg: project.destinationOrg || '',
      outputDir: paths.destination,
      apiVersion: destInfo.apiVersion,
      logPath: destLogPath,
      statusPath: destStatusPath,
      chunkManifests: destChunk.chunkManifests
    });
    updateStage('retrieve_destination', 'done');

    updateStage('snapshot', 'running');
    const snapshotDir = path.join(jobDir, 'snapshots');
    const sourceSnapshotMeta = {
      jobId: job.id,
      target: 'source',
      orgAlias: project.sourceOrg,
      apiVersion: sourceInfo.apiVersion || null,
      manifestStrategy,
      triggeredBy: job.userId,
      timestamp: new Date().toISOString(),
      context: payload.context || {}
    };
    const destSnapshotMeta = {
      jobId: job.id,
      target: 'destination',
      orgAlias: project.destinationOrg,
      apiVersion: destInfo.apiVersion || null,
      manifestStrategy,
      triggeredBy: job.userId,
      timestamp: new Date().toISOString(),
      context: payload.context || {}
    };
    copySnapshot(paths.source, path.join(snapshotDir, 'source'), sourceManifestXml, sourceSnapshotMeta);
    copySnapshot(paths.destination, path.join(snapshotDir, 'destination'), destManifestXml, destSnapshotMeta);
    updateStage('snapshot', 'done');

    updateStage('normalize', 'running');
    updateStage('normalize', 'done');
    updateStage('compare', 'running');
    const changes = diffWorkspaces(paths.source, paths.destination);
    writeComparisonCsv(diffLog, changes);
    updateStage('compare', 'done');

    updateStage('analyze', 'running');
    writeComparisonHtmlReport(reportPath, {
      projectId: project.id,
      projectName: project.name,
      sourceOrg: project.sourceOrg,
      destinationOrg: project.destinationOrg,
      changes
    });
    const deltaXml = generateDeltaManifest(deltaSnapshot, changes);
    const destructiveXml = generateDestructiveChanges(destructiveSnapshot, changes);
    updateStage('analyze', 'done');
    updateStage('report', 'running');
    updateStage('report', 'done');
    updateStage('storage', 'running');

    jobStatus.status = 'done';
    jobStatus.completedAt = new Date().toISOString();
    jobStatus.outputs = {
      diffLog: path.relative(paths.root, diffLog),
      reportRelPath,
      deltaXml,
      destructiveXml,
      changesCount: changes.length,
      changes
    };
    writeStatus(statusPath, jobStatus);
    updateComparison(job.id, {
      diffLog,
      reportPath,
      reportRelPath,
      deltaManifest: deltaSnapshot,
      destructiveManifest: destructiveXml ? destructiveSnapshot : null,
      manifestStrategy,
      sourceOrg: project.sourceOrg,
      destinationOrg: project.destinationOrg,
      jobStatus,
      snapshot: { source: path.join(snapshotDir, 'source'), destination: path.join(snapshotDir, 'destination') },
      completedAt: jobStatus.completedAt,
      changes
    });
    updateStage('storage', 'done');
    appendJobLog(jobLogPath, 'job done');
    return jobStatus;
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    jobStatus.status = 'failed';
    jobStatus.error = message;
    jobStatus.updatedAt = new Date().toISOString();
    writeStatus(statusPath, jobStatus);
    updateComparison(job.id, { jobStatus });
    appendJobLog(jobLogPath, `job failed - ${message}`);
    throw err;
  }
}
