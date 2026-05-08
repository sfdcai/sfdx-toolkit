import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { getDb } from '@/lib/db';
import { consumeResetToken } from '@/lib/password-reset';

export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}));
  const limiter = rateLimit(`reset:${req.headers.get('x-forwarded-for') || 'local'}`, 5, 10 * 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json({ message: 'Too many requests. Try again later.' }, { status: 429 });
  }
  if (!token || !password) {
    return NextResponse.json({ message: 'Token and new password are required.' }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const record = consumeResetToken(String(token));
  if (!record) {
    recordAudit(req as any, null, 'auth.reset_failed', 'user', undefined, { reason: 'invalid_token' });
    return NextResponse.json({ message: 'Reset token is invalid or expired.' }, { status: 400 });
  }

  const hash = hashPassword(String(password));
  const db = getDb();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, record.userId);
  recordAudit(req as any, { id: record.userId }, 'auth.reset_completed', 'user', record.userId, {});
  return NextResponse.json({ message: 'Password reset successfully.' });
}
