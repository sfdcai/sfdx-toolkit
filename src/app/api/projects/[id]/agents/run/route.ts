import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths, resolveUserPath } from '@/lib/path';
import { executeAutoHealing } from '@/lib/agents/agent-engine';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { jobId } = body;
  if (!jobId) {
    return NextResponse.json({ message: 'Missing jobId parameter' }, { status: 400 });
  }

  const jobDir = resolveUserPath(user.id, 'projects', project.name, 'deploy', 'logs', 'deployments', jobId);
  const statusPath = path.join(jobDir, 'job-status.json');
  if (!fs.existsSync(statusPath)) {
    return NextResponse.json({ message: 'Job status file not found' }, { status: 404 });
  }

  const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const failuresList = statusData?.record?.output?.result?.details?.componentFailures || 
                       statusData?.record?.output?.result?.details?.componentFailure || 
                       statusData?.record?.output?.details?.componentFailures || 
                       statusData?.record?.output?.details?.componentFailure || 
                       statusData?.output?.result?.details?.componentFailures || 
                       statusData?.output?.result?.details?.componentFailure || 
                       [];
  const failuresArray = Array.isArray(failuresList) ? failuresList : [failuresList];

  const paths = projectPaths(user.id, project.name);
  const result = await executeAutoHealing({
    tenantId: project.tenantId,
    projectId: project.id,
    jobId,
    failures: failuresArray,
    sourceDir: paths.source,
    deployDir: paths.deploy
  });

  return NextResponse.json({
    message: 'Manual agent auto-healing execution completed',
    ...result
  });
}
