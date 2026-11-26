import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { runEnvironmentSync, SyncConfig, SyncProgressEvent } from '@/lib/sync-engine';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  
  const body = await req.json().catch(() => ({}));
  const { checkOnly = false, autoSanitize = true, alignUserData = true } = body;
  
  const sourceOrg = project.sourceOrg;
  const destOrg = project.destinationOrg;
  
  if (!sourceOrg || !destOrg) {
    return NextResponse.json({ message: 'Both Source and Destination orgs must be configured on the project.' }, { status: 400 });
  }

  const paths = projectPaths(user.id, project.name);
  const jobId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'sync-jobs', jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  
  const statusPath = path.join(jobDir, 'job-status.json');
  const syncLogPath = path.join(jobDir, 'sync.log');
  const now = new Date().toISOString();

  fs.writeFileSync(statusPath, JSON.stringify({
    jobId,
    projectId: project.id,
    sourceOrg,
    destOrg,
    status: 'running',
    stage: 'validating_health',
    percent: 5,
    startedAt: now,
    updatedAt: now,
    summary: 'Starting autonomous environment synchronization...'
  }, null, 2), 'utf8');

  // Launch async
  void (async () => {
    try {
      const syncConfig: SyncConfig = {
        sourceOrg,
        destOrg,
        stagingDir: path.join(paths.source, 'force-app', 'main', 'default'),
        checkOnly,
        autoSanitize,
        alignUserData,
        onProgress: (event: SyncProgressEvent) => {
          fs.appendFileSync(syncLogPath, `[${event.timestamp}] [${event.stage}] (${event.percent}%) ${event.message}\n`, 'utf8');
          fs.writeFileSync(statusPath, JSON.stringify({
            jobId,
            projectId: project.id,
            sourceOrg,
            destOrg,
            status: 'running',
            stage: event.stage,
            percent: event.percent,
            message: event.message,
            updatedAt: event.timestamp
          }, null, 2), 'utf8');
        }
      };

      const result = await runEnvironmentSync(syncConfig);
      fs.writeFileSync(statusPath, JSON.stringify({
        jobId,
        projectId: project.id,
        sourceOrg,
        destOrg,
        status: result.success ? 'succeeded' : 'failed',
        result,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    } catch (e: any) {
      fs.writeFileSync(statusPath, JSON.stringify({
        jobId,
        projectId: project.id,
        sourceOrg,
        destOrg,
        status: 'failed',
        error: e.message || String(e),
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    }
  })();

  return NextResponse.json({
    message: 'Autonomous environment sync job started',
    jobId,
    statusRelPath: path.relative(paths.root, statusPath),
    logRelPath: path.relative(paths.root, syncLogPath)
  });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ message: 'jobId query param required' }, { status: 400 });

  const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'sync-jobs', jobId);
  const statusPath = path.join(jobDir, 'job-status.json');
  if (!fs.existsSync(statusPath)) {
    return NextResponse.json({ message: 'Job not found' }, { status: 404 });
  }

  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  return NextResponse.json(status);
}
