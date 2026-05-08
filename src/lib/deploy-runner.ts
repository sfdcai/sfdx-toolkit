import fs from 'fs';
import path from 'path';
import { deployWithCli } from './deploy';
import { ensureSfdxProject, mapRelPathToMetadata } from './metadata';
import { projectPaths, resolveUserPath } from './path';
import { getProject, JobRecord, saveDeployment, updateJob } from './store';

export type DeployJobPayload = {
  jobId: string;
  testLevel?: string;
  runTests?: string[];
  checkOnly?: boolean;
  autoRetry?: boolean;
  retryLimit?: number;
  manifestPath?: string | null;
  components?: string[];
};

function writeStatus(statusPath: string, payload: Record<string, unknown>) {
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function runDeployJob(job: JobRecord) {
  const payload = job.payload as DeployJobPayload;
  const project = getProject(job.userId, job.projectId);
  if (!project) {
    updateJob(job.id, { status: 'failed', error: 'Project not found', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    throw new Error('Project not found for deployment job.');
  }
  if (!project.destinationOrg) {
    updateJob(job.id, { status: 'failed', error: 'Destination org not set', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    throw new Error('Destination org not set on project.');
  }

  const paths = projectPaths(job.userId, project.name);
  const jobDir = resolveUserPath(job.userId, 'projects', project.name, 'deploy', 'logs', 'deployments', job.id);
  fs.mkdirSync(jobDir, { recursive: true });
  const statusPath = path.join(jobDir, 'job-status.json');
  const deployLog = path.join(jobDir, 'deploy.log');
  const orgPath = resolveUserPath(job.userId, 'orgs', project.destinationOrg);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  const selectionPath = path.join(paths.deploy, 'selection.json');
  const selectionData = fs.existsSync(selectionPath) ? JSON.parse(fs.readFileSync(selectionPath, 'utf8')) : null;
  const selectionPaths: string[] = Array.isArray(selectionData?.selection)
    ? selectionData.selection.filter((value: unknown): value is string => typeof value === 'string')
    : [];

  ensureSfdxProject(paths.deploy, info.apiVersion);
  writeStatus(statusPath, {
    jobId: job.id,
    projectId: project.id,
    status: 'running',
    startedAt: job.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deployLog: path.relative(paths.root, deployLog),
    summary: 'Deployment started'
  });

  try {
    const result = deployWithCli({
      projectPath: paths.deploy,
      deployLogPath: deployLog,
      manifestPath: payload.manifestPath || paths.manifests.delta,
      testLevel: payload.testLevel,
      runTests: payload.runTests || [],
      checkOnly: payload.checkOnly || false,
      autoRetry: payload.autoRetry !== false,
      retryLimit: payload.retryLimit,
      components: payload.components || [],
      targetOrg: project.destinationOrg,
      apiVersion: info.apiVersion,
      sourcePath: paths.source,
      selectionPaths
    });

    if ((payload.autoRetry !== false) && result.failedComponents?.length && selectionPaths.length) {
      const failed = new Set(result.failedComponents);
      const filtered = selectionPaths.filter((relPath: string) => {
        const mapped = mapRelPathToMetadata(relPath);
        return !failed.has(`${mapped.type}:${mapped.name}`);
      });
      fs.writeFileSync(
        selectionPath,
        JSON.stringify({ updatedAt: new Date().toISOString(), selection: filtered }, null, 2),
        'utf8'
      );
    }

    const normalizedResult = { ...result, output: result.output ?? {} };
    const record = saveDeployment({
      userId: job.userId,
      tenantId: project.tenantId,
      projectId: project.id,
      ...normalizedResult
    });
    const finalStatus = normalizedResult.status === 'Failed' ? 'failed' : 'done';
    const now = new Date().toISOString();
    writeStatus(statusPath, {
      jobId: job.id,
      projectId: project.id,
      status: finalStatus,
      startedAt: job.startedAt || job.createdAt,
      completedAt: now,
      updatedAt: now,
      deployLog: path.relative(paths.root, deployLog),
      result: {
        status: normalizedResult.status,
        attempts: normalizedResult.attempts,
        failedComponents: normalizedResult.failedComponents,
        manifestPath: normalizedResult.manifestPath
      },
      record
    });
    updateJob(job.id, {
      status: finalStatus,
      completedAt: now,
      updatedAt: now,
      error: finalStatus === 'failed' ? 'Deployment failed' : null
    });
  } catch (err) {
    const now = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    writeStatus(statusPath, {
      jobId: job.id,
      projectId: project.id,
      status: 'failed',
      startedAt: job.startedAt || job.createdAt,
      completedAt: now,
      updatedAt: now,
      deployLog: path.relative(paths.root, deployLog),
      error: message
    });
    updateJob(job.id, {
      status: 'failed',
      completedAt: now,
      updatedAt: now,
      error: message
    });
    throw err;
  }
}
