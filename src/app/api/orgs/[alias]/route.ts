import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { execFileSync } from 'node:child_process';
import { getAuthUser } from '@/lib/api';
import { encryptSecret, redactAuthSecrets } from '@/lib/secret-store';
import { getOrg, linkOrg, deleteOrg, renameOrgAlias } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';
import { getSfCommand, getSfEnv } from '@/lib/sf';

export async function GET(req: Request, { params }: { params: { alias: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const org = getOrg(user.id, params.alias);
  if (!org) return NextResponse.json({ message: 'Org not found' }, { status: 404 });
  const orgPath = resolveUserPath(user.id, 'orgs', org.alias);
  const infoPath = path.join(orgPath, 'org-info.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : {};
  return NextResponse.json({ ...org, info });
}

export async function PATCH(req: Request, { params }: { params: { alias: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const org = getOrg(user.id, params.alias);
  if (!org) return NextResponse.json({ message: 'Org not found' }, { status: 404 });
  const { sfdxAuthUrl, alias: nextAlias } = await req.json();
  if (!sfdxAuthUrl) {
    return NextResponse.json({ message: 'sfdxAuthUrl is required to refresh org details.' }, { status: 400 });
  }
  const finalAlias = nextAlias === undefined ? org.alias : String(nextAlias || '').trim();
  if (!finalAlias) {
    return NextResponse.json({ message: 'Alias is required.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(finalAlias)) {
    return NextResponse.json({ message: 'Alias contains invalid characters.' }, { status: 400 });
  }
  if (finalAlias !== org.alias) {
    const exists = getOrg(user.id, finalAlias);
    if (exists) return NextResponse.json({ message: `Org alias "${finalAlias}" already exists.` }, { status: 409 });
  }

  const orgPath = resolveUserPath(user.id, 'orgs', org.alias);
  const nextPath = resolveUserPath(user.id, 'orgs', finalAlias);
  if (orgPath !== nextPath) {
    fs.renameSync(orgPath, nextPath);
  }
  let info: Record<string, unknown> = {};
  try {
    const sfCommand = getSfCommand();
    const sfdxUrlFile = path.join(nextPath, 'sfdxAuthUrl.txt');
    fs.writeFileSync(sfdxUrlFile, sfdxAuthUrl, 'utf8');
    const authRaw = execFileSync(
      sfCommand,
      ['org', 'login', 'sfdx-url', '--sfdx-url-file', sfdxUrlFile, '--alias', finalAlias, '--json'],
      { encoding: 'utf8', env: getSfEnv() }
    );
    const displayRaw = execFileSync(
      sfCommand,
      ['org', 'display', '--target-org', finalAlias, '--verbose', '--json'],
      { encoding: 'utf8', env: getSfEnv() }
    );
    const parsed = JSON.parse(displayRaw || '{}');
    info = parsed.result ? parsed.result : {};
    fs.writeFileSync(
      path.join(nextPath, 'auth.log'),
      `LOGIN: ${redactAuthSecrets(authRaw)}\nDISPLAY: ${redactAuthSecrets(displayRaw)}\n`,
      'utf8'
    );
    fs.rmSync(sfdxUrlFile, { force: true });
  } catch (err) {
    const stdout = err instanceof Error && (err as Error & { stdout?: string }).stdout ? String((err as Error & { stdout?: string }).stdout) : '';
    const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
    return NextResponse.json(
      { message: 'Org authentication failed. Please verify the sfdxAuthUrl.', details: redactAuthSecrets(stdout || stderr) },
      { status: 400 }
    );
  }
  fs.writeFileSync(path.join(nextPath, 'auth.json'), JSON.stringify(encryptSecret(sfdxAuthUrl), null, 2));
  fs.writeFileSync(path.join(nextPath, 'org-info.json'), JSON.stringify(info, null, 2));
  if (finalAlias !== org.alias) {
    renameOrgAlias(user.id, org.alias, finalAlias);
  }
  const saved = linkOrg({ ...org, alias: finalAlias, info } as any);
  return NextResponse.json({ ...saved, info, message: 'Org updated.' });
}

export async function DELETE(req: Request, { params }: { params: { alias: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const org = getOrg(user.id, params.alias);
  if (!org) return NextResponse.json({ message: 'Org not found' }, { status: 404 });
  const orgPath = resolveUserPath(user.id, 'orgs', org.alias);
  try {
    fs.rmSync(orgPath, { recursive: true, force: true });
  } catch {
    // ignore filesystem cleanup failure
  }
  deleteOrg(user.id, org.alias);
  return NextResponse.json({ message: `Org ${org.alias} deleted.` });
}
