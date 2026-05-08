import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { generateSecret, generateURI } from 'otplib';
import { getAuthUser } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { appBaseUrl } from '@/lib/mfa';
import { disableUserMfa, findUserById, saveUserMfaSecret } from '@/lib/store';

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const account = findUserById(user.id);
  if (!account) return NextResponse.json({ message: 'User not found' }, { status: 404 });

  const secret = generateSecret();
  const otpauth = generateURI({ issuer: appBaseUrl, label: account.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  saveUserMfaSecret(user.id, secret);
  recordAudit(req as any, user, 'auth.mfa_setup_started', 'user', user.id, {});

  return NextResponse.json({
    message: 'Scan the QR code, then verify with a 6-digit code to enable MFA.',
    secret,
    otpauth,
    qrCodeDataUrl
  });
}

export async function DELETE(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  disableUserMfa(user.id);
  recordAudit(req as any, user, 'auth.mfa_disabled', 'user', user.id, {});
  return NextResponse.json({ message: 'MFA disabled.' });
}
