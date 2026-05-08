import { NextResponse } from 'next/server';
import { verifySync } from 'otplib';
import { getAuthUser } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { signToken, verifyMfaChallengeToken } from '@/lib/auth';
import { enableUserMfa, findUserById } from '@/lib/store';

type VerifyPayload = {
  code?: string;
  challengeToken?: string;
};

function normalizeCode(code: string | undefined) {
  return String(code || '').replace(/\s+/g, '');
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as VerifyPayload;
  const code = normalizeCode(body.code);
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ message: 'A valid 6-digit MFA code is required.' }, { status: 400 });
  }

  const user = getAuthUser(req as any);
  if (user) {
    const account = findUserById(user.id);
    if (!account?.mfaSecret) {
      return NextResponse.json({ message: 'MFA setup has not been started for this account.' }, { status: 400 });
    }
    if (!verifySync({ token: code, secret: account.mfaSecret })) {
      recordAudit(req as any, user, 'auth.mfa_setup_failed', 'user', user.id, {});
      return NextResponse.json({ message: 'Invalid MFA code.' }, { status: 401 });
    }
    enableUserMfa(user.id);
    recordAudit(req as any, user, 'auth.mfa_enabled', 'user', user.id, {});
    return NextResponse.json({ message: 'MFA enabled.', mfaEnabled: true });
  }

  if (!body.challengeToken) {
    return NextResponse.json({ message: 'MFA challenge token is required.' }, { status: 400 });
  }

  let challenge;
  try {
    challenge = verifyMfaChallengeToken(body.challengeToken);
  } catch {
    return NextResponse.json({ message: 'Invalid or expired MFA challenge.' }, { status: 401 });
  }

  const account = findUserById(challenge.id);
  if (!account?.mfaEnabled || !account.mfaSecret) {
    return NextResponse.json({ message: 'MFA is not enabled for this account.' }, { status: 400 });
  }
  if (!verifySync({ token: code, secret: account.mfaSecret })) {
    recordAudit(req as any, { id: account.id, tenantId: account.tenantId }, 'auth.mfa_login_failed', 'user', account.id, {});
    return NextResponse.json({ message: 'Invalid MFA code.' }, { status: 401 });
  }

  const token = signToken(account);
  recordAudit(req as any, { id: account.id, tenantId: account.tenantId }, 'auth.mfa_login', 'user', account.id, {});
  return NextResponse.json({ token, user: { id: account.id, email: account.email, role: account.role } });
}
