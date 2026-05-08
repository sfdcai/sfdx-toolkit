import fs from 'fs';
import path from 'path';
import crypto from "crypto";
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { canRunDeploy, enqueueJob, getProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { ensureSfdxProject } from '@/lib/metadata';
import { runDeployJob, type DeployJobPayload } from '@/lib/deploy-runner';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin' && !canRunDeploy(user.tenantId)) {
    return NextResponse.json({ message: 'Deploy limit reached for this tenant.' }, { status: 403 });
  }
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  const body = await req.json();
  const { testLevel, runTests = [], checkOnly = false, autoRetry = true, retryLimit, manifestPath, components = [] } = body || {};
  const normalizedRetryLimit = Math.max(1, Math.min(5, Number(retryLimit) || 3));
  const paths = projectPaths(user.id, project.name);
  const targetOrg = project.destinationOrg;
  if (!targetOrg) return NextResponse.json({ message: 'Destination org not set on project' }, { status: 400 });
  const deployLog = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'deployment.log');
  const orgPath = resolveUserPath(user.id, 'orgs', targetOrg);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  const selectionPath = path.join(paths.deploy, 'selection.json');
  const selectionData = fs.existsSync(selectionPath) ? JSON.parse(fs.readFileSync(selectionPath, 'utf8')) : null;
  ensureSfdxProject(paths.deploy, info.apiVersion);
  const jobId = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'deployments', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const statusPath = path.join(jobDir, 'job-status.json');
  const deployLogPath = path.join(jobDir, 'deploy.log');
  const now = new Date().toISOString();
  fs.writeFileSync(statusPath, JSON.stringify({
    jobId,
    projectId: project.id,
    status: 'running',
    startedAt: now,
    updatedAt: now,
    deployLog: path.relative(paths.root, deployLogPath),
    summary: 'Deployment queued'
  }, null, 2), 'utf8');
  const payload: DeployJobPayload = {
    jobId,
    testLevel,
    runTests,
    checkOnly,
    autoRetry,
    retryLimit: normalizedRetryLimit,
    manifestPath: manifestPath || paths.manifests.delta,
    components
  };
  const jobRecord = enqueueJob({
    id: jobId,
    tenantId: project.tenantId,
    userId: user.id,
    projectId: project.id,
    type: 'deploy',
    status: 'running',
    payload,
    startedAt: now,
    updatedAt: now
  });
  void runDeployJob(jobRecord).catch(() => {
    // status file and job table are updated inside the runner
  });
  return NextResponse.json({
    message: 'Deployment job queued',
    jobId,
    deployLog: path.relative(paths.root, deployLogPath),
    statusRelPath: path.relative(paths.root, statusPath)
  });
}
