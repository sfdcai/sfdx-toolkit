import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { encryptSecret, redactAuthSecrets } from '@/lib/secret-store';
import { getSfCommand, getSfEnv } from '@/lib/sf';
import { canCreateOrg, getOrg, linkOrg, listOrgs } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';
import { recordAudit } from '@/lib/audit';
import { isValidSfdxAuthUrl } from '@/lib/validate';

export async function GET(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(listOrgs(user.id));
}

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { alias, sfdxAuthUrl } = await req.json();
  const trimmedAlias = String(alias || '').trim();
  if (!trimmedAlias || !sfdxAuthUrl) {
    return NextResponse.json({ message: 'Alias and sfdxAuthUrl are required' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedAlias)) {
    return NextResponse.json({ message: 'Alias contains invalid characters.' }, { status: 400 });
  }
  if (!isValidSfdxAuthUrl(sfdxAuthUrl)) {
    return NextResponse.json({ message: 'sfdxAuthUrl must start with force://' }, { status: 400 });
  }
  const existing = getOrg(user.id, trimmedAlias);
  if (existing) {
    return NextResponse.json({ message: `Org alias "${trimmedAlias}" already exists.` }, { status: 409 });
  }
  if (user.role !== 'super_admin' && !canCreateOrg(user.tenantId)) {
    return NextResponse.json({ message: 'Org limit reached for this tenant.' }, { status: 403 });
  }
  const orgPath = resolveUserPath(user.id, 'orgs', trimmedAlias);
  fs.mkdirSync(orgPath, { recursive: true });
  let info: Record<string, unknown> = {};
  try {
    const sfCommand = getSfCommand();
    const sfdxUrlFile = path.join(orgPath, 'sfdxAuthUrl.txt');
    fs.writeFileSync(sfdxUrlFile, sfdxAuthUrl, 'utf8');
    const authRaw = execFileSync(
      sfCommand,
      ['org', 'login', 'sfdx-url', '--sfdx-url-file', sfdxUrlFile, '--alias', trimmedAlias, '--json'],
      { encoding: 'utf8', env: getSfEnv() }
    );
    const displayRaw = execFileSync(
      sfCommand,
      ['org', 'display', '--target-org', trimmedAlias, '--verbose', '--json'],
      { encoding: 'utf8', env: getSfEnv() }
    );
    const parsed = JSON.parse(displayRaw || '{}');
    info = parsed.result ? parsed.result : {};
    fs.writeFileSync(
      path.join(orgPath, 'auth.log'),
      `LOGIN: ${redactAuthSecrets(authRaw)}\nDISPLAY: ${redactAuthSecrets(displayRaw)}\n`,
      'utf8'
    );
    fs.rmSync(sfdxUrlFile, { force: true });
  } catch (err) {
    const stdout = err instanceof Error && (err as Error & { stdout?: string }).stdout ? String((err as Error & { stdout?: string }).stdout) : '';
    const stderr = err instanceof Error && (err as Error & { stderr?: string }).stderr ? String((err as Error & { stderr?: string }).stderr) : (err as Error).message;
    try {
      fs.rmSync(orgPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
    recordAudit(req as any, user, 'org.add_failed', 'org', trimmedAlias, { error: stdout || stderr });
    return NextResponse.json(
      { message: 'Org authentication failed. Please verify the sfdxAuthUrl.', details: redactAuthSecrets(stdout || stderr) },
      { status: 400 }
    );
  }
  fs.writeFileSync(path.join(orgPath, 'auth.json'), JSON.stringify(encryptSecret(sfdxAuthUrl), null, 2));
  fs.writeFileSync(path.join(orgPath, 'org-info.json'), JSON.stringify(info, null, 2));
  const org = linkOrg({ id: '', userId: user.id, alias: trimmedAlias, info } as any);
  recordAudit(req as any, user, 'org.add', 'org', trimmedAlias, { alias: trimmedAlias });
  const message = info.apiVersion ? `Org saved. API version ${info.apiVersion}.` : 'Org saved. API version unavailable.';
  return NextResponse.json({ ...org, info, message }, { status: 201 });
}
