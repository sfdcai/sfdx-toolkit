import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const user = getAuthUser(req as any);
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  const limiter = rateLimit(`password:${req.headers.get('x-forwarded-for') || 'local'}`, 5, 10 * 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json({ message: 'Too many attempts. Try again later.' }, { status: 429 });
  }
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ message: 'Current and new password are required.' }, { status: 400 });
  }
  if (String(newPassword).length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash?: string } | undefined;
  if (!row?.password_hash || !verifyPassword(String(currentPassword), row.password_hash)) {
    recordAudit(req as any, user, 'profile.password_failed', 'user', user.id, {});
    return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 400 });
  }
  const hash = hashPassword(String(newPassword));
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  recordAudit(req as any, user, 'profile.password_changed', 'user', user.id, {});
  return NextResponse.json({ message: 'Password updated.' });
}
