import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { decryptSecret } from '@/lib/secret-store';
import { getOrg } from '@/lib/store';
import { resolveUserPath } from '@/lib/path';

export async function GET(req: Request, { params }: { params: { alias: string } }) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const org = getOrg(user.id, params.alias);
  if (!org) return NextResponse.json({ message: 'Org not found' }, { status: 404 });
  const orgPath = resolveUserPath(user.id, 'orgs', org.alias);
  const authPath = path.join(orgPath, 'auth.json');
  if (!fs.existsSync(authPath)) {
    return NextResponse.json({ message: 'No stored auth URL.' }, { status: 404 });
  }
  const payload = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  const sfdxAuthUrl = decryptSecret(payload);
  if (!sfdxAuthUrl) {
    return NextResponse.json({ message: 'No stored auth URL.' }, { status: 404 });
  }
  return NextResponse.json({ sfdxAuthUrl });
}
