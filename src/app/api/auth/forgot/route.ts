import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { findUserByEmail } from '@/lib/store';
import { normalizeEmail, isValidEmail } from '@/lib/validate';
import { sendEmail } from '@/lib/email';
import { createResetTokenEntry, generateResetToken } from '@/lib/password-reset';

function getBaseUrl(req: Request) {
  const envBase = process.env.APP_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  const normalizedEmail = normalizeEmail(email);
  const limiter = rateLimit(`forgot:${req.headers.get('x-forwarded-for') || 'local'}`, 5, 10 * 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json({ message: 'Too many requests. Try again later.' }, { status: 429 });
  }
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
  }

  const user = findUserByEmail(normalizedEmail);
  if (!user) {
    recordAudit(req as any, null, 'auth.reset_request_missing', 'user', undefined, { email: normalizedEmail });
    return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
  }

  const token = generateResetToken();
  createResetTokenEntry(user.id, token, {
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    userAgent: req.headers.get('user-agent')
  });

  const baseUrl = getBaseUrl(req);
  const resetUrl = `${baseUrl}/reset?token=${encodeURIComponent(token)}`;
  const mail = await sendEmail({
    to: user.email,
    subject: 'Password reset',
    text: `Use this link to reset your password: ${resetUrl}`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
  });

  recordAudit(req as any, { id: user.id, tenantId: user.tenantId }, 'auth.reset_requested', 'user', user.id, {
    email: normalizedEmail,
    sent: mail.ok
  });

  if (!mail.ok) {
    const reason = 'error' in mail ? mail.error : 'unknown';
    recordAudit(req as any, { id: user.id, tenantId: user.tenantId }, 'auth.reset_email_failed', 'user', user.id, {
      reason
    });
  }

  return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
}
