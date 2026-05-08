import fs from 'fs';
import path from 'path';
import crypto from "crypto";
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject, saveComparison } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { runCompareJob, CompareJobPayload, ManifestScope } from '@/lib/compare-runner';

function writeStatus(statusPath: string, payload: Record<string, unknown>) {
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), 'utf8');
}

type CompareJobBody = {
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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = getAuthUser(req as any);
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const project = getProject(user.id, params.id);
    if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    if (!project.sourceOrg || !project.destinationOrg) {
      return NextResponse.json({ message: 'Source and destination orgs must be set before comparing.' }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as CompareJobBody;
    const manifestStrategy = body.manifestStrategy || 'existing';
    const jobId = crypto.randomUUID().replace(/-/g,"").substring(0, 16);
    const paths = projectPaths(user.id, project.name);
    const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'comparisons', jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    const statusPath = path.join(jobDir, 'job-status.json');
    const diffLog = path.join(jobDir, 'comparison.csv');
    const reportPath = path.join(jobDir, 'comparison-report.html');
    const reportRelPath = path.relative(paths.root, reportPath);
    const deltaSnapshot = path.join(jobDir, 'delta-package.xml');
    const destructiveSnapshot = path.join(jobDir, 'destructiveChanges.xml');
    const initialStatus = {
      jobId,
      projectId: project.id,
      userId: user.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      manifestStrategy,
      stages: [
        { name: 'context', status: 'running', startedAt: new Date().toISOString() }
      ],
      outputs: {}
    };
    writeStatus(statusPath, initialStatus);
    const jobLogPath = path.join(jobDir, 'job.log');
    if (!fs.existsSync(jobLogPath)) {
      fs.writeFileSync(jobLogPath, `Job ${jobId} queued ${new Date().toISOString()}\n`, 'utf8');
    }
    saveComparison({
      id: jobId,
      tenantId: project.tenantId,
      userId: user.id,
      projectId: project.id,
      diffLog,
      reportPath,
      reportRelPath,
      deltaManifest: deltaSnapshot,
      destructiveManifest: null,
      manifestStrategy,
      sourceOrg: project.sourceOrg,
      destinationOrg: project.destinationOrg,
      jobStatus: initialStatus,
      changes: []
    });
    const payload: CompareJobPayload = {
      jobId,
      manifestStrategy,
      manifestXml: body.manifestXml,
      mergeManifests: body.mergeManifests,
      scope: body.scope,
      context: body.context
    };
    const jobRecord = {
      id: jobId,
      tenantId: project.tenantId,
      userId: user.id,
      projectId: project.id,
      type: 'compare',
      status: 'running' as const,
      payload,
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    void runCompareJob(jobRecord);

    return NextResponse.json({
      message: 'Comparison job queued',
      jobId,
      statusRelPath: path.relative(paths.root, statusPath),
      reportRelPath
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message, error: message }, { status: 500 });
  }
}
