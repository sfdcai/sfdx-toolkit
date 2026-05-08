import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getProject } from '@/lib/store';
import { projectPaths } from '@/lib/path';
import { getSfCommand, getSfEnv } from '@/lib/sf';

function parseSfJson(stdout = '') {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        // ignore
      }
    }
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { id: string; target: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const project = getProject(user.id, params.id);
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });
  if (!['source', 'destination'].includes(params.target)) {
    return NextResponse.json({ message: 'Project or target not found' }, { status: 404 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || '';
  const refresh = url.searchParams.get('refresh') === 'true';
  if (!type) return NextResponse.json({ message: 'Type is required' }, { status: 400 });
  const orgAlias = params.target === 'source' ? project.sourceOrg : project.destinationOrg;
  if (!orgAlias) return NextResponse.json({ message: 'Org alias not set on project' }, { status: 400 });
  const paths = projectPaths(user.id, project.name);
  const folder = params.target === 'source' ? paths.source : paths.destination;
  const cacheDir = path.join(folder, 'logs', 'members-cache');
  const cacheFile = path.join(cacheDir, `${type.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`);
  if (!refresh && fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return NextResponse.json({ type, members: cached.members || [], cached: true });
  }
  const sfCommand = getSfCommand();
  try {
    const stdout = execFileSync(
      sfCommand,
      ['org', 'list', 'metadata', '--target-org', orgAlias, '--metadata-type', type, '--json'],
      { encoding: 'utf8', env: getSfEnv() }
    ).trim();
    const parsed = parseSfJson(stdout);
    const result = parsed?.result;
    const members = Array.isArray(result)
      ? result
          .map((item: any) => item?.fullName || item?.name || item?.xmlName || item)
          .filter(Boolean)
          .map((item: any) => String(item))
      : [];
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ type, members, cachedAt: new Date().toISOString() }, null, 2), 'utf8');
    return NextResponse.json({ type, members, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list members';
    return NextResponse.json({ message }, { status: 500 });
  }
}
