import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { execFileSync } from 'node:child_process';
import { getAuthUser } from '@/lib/api';
import { getAppVersionInfo } from '@/lib/app-version';
import { dbStats } from '@/lib/db';
import { listTenants } from '@/lib/store';
import { userRoot } from '@/lib/config';
import { getSfCommand, getSfEnv } from '@/lib/sf';

function readSfCliUpdater() {
  const historyPath = path.join(process.cwd(), 'data', 'sf-cli-update-history.json');
  let latest: any = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    if (Array.isArray(parsed) && parsed.length) {
      latest = parsed[parsed.length - 1];
    }
  } catch {
    latest = null;
  }

  let timerEnabled = false;
  let serviceEnabled = false;
  try {
    timerEnabled = execFileSync('systemctl', ['is-enabled', 'sfdx-sf-cli-update.timer'], { encoding: 'utf8' }).trim() === 'enabled';
  } catch {
    timerEnabled = false;
  }
  try {
    serviceEnabled = execFileSync('systemctl', ['is-enabled', 'sfdx-sf-cli-update.service'], { encoding: 'utf8' }).trim() === 'enabled';
  } catch {
    serviceEnabled = false;
  }

  return {
    status: latest?.error ? 'error' : latest ? 'configured' : 'missing',
    timerEnabled,
    serviceEnabled,
    lastCheckedAt: latest?.checkedAt || '',
    currentVersion: latest?.currentVersion || '',
    latestVersion: latest?.latestVersion || '',
    updateAttempted: Boolean(latest?.updateAttempted),
    updateApplied: Boolean(latest?.updateApplied),
    message: latest?.message || 'No update history found.'
  };
}

function folderSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += folderSizeBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  });
  return total;
}

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const stats = dbStats();
  const tenants = listTenants();
  const app = getAppVersionInfo();
  const sfCliUpdater = readSfCliUpdater();
  let sf = { status: 'missing', details: 'sf CLI not found', path: '' };
  try {
    const sfCommand = getSfCommand();
    const output = execFileSync(sfCommand, ['--version'], { encoding: 'utf8', env: getSfEnv() }).trim();
    const version = output.split('\n').find((line) => line.includes('@salesforce/cli')) || output;
    sf = { status: 'connected', details: version, path: sfCommand };
  } catch {
    sf = { status: 'missing', details: 'sf CLI not found', path: '' };
  }
  const storageBytes = folderSizeBytes(userRoot);
  return NextResponse.json({
    app,
    db: stats,
    tenants: tenants.length,
    storageBytes,
    sf,
    sfCliUpdater
  });
}
