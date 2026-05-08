import { execFileSync } from 'node:child_process';
import { NextResponse } from 'next/server';
import { dbStats } from '@/lib/db';
import { getAppVersionInfo } from '@/lib/app-version';
import { getSfCommand, getSfEnv } from '@/lib/sf';

const SF_CACHE_TTL_MS = 60000;
let sfCache: { ts: number; value: { status: string; details: string; path?: string } } | null = null;

function loadStats() {
  return dbStats();
}

function sfSnapshot() {
  if (sfCache && Date.now() - sfCache.ts < SF_CACHE_TTL_MS) {
    return sfCache.value;
  }
  try {
    const sfCommand = getSfCommand();
    const output = execFileSync(sfCommand, ['--version'], { encoding: 'utf8', env: getSfEnv() }).trim();
    const version = output.split('\n').find((line) => line.includes('@salesforce/cli')) || output;
    const value = { status: 'connected', details: version, path: sfCommand };
    sfCache = { ts: Date.now(), value };
    return value;
  } catch (err) {
    const value = { status: 'missing', details: 'sf CLI not found' };
    sfCache = { ts: Date.now(), value };
    return value;
  }
}

export async function GET() {
  const stats = loadStats();
  const app = getAppVersionInfo();
  return NextResponse.json({
    app: {
      status: 'running',
      details: app.version,
      hash: app.hash,
      baseVersion: app.baseVersion,
      sourceCount: app.sourceCount,
      buildTimestamp: app.buildTimestamp
    },
    database: {
      status: 'connected',
      details: `${stats.users} users, ${stats.projects} projects, ${stats.orgs} orgs`
    },
    sandbox: { status: 'locked', details: 'User home isolation enforced' },
    sf: sfSnapshot()
  });
}
