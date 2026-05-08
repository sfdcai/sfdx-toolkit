import { NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/store';
import { signMfaChallengeToken, signToken, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail, isValidEmail } from '@/lib/validate';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const normalizedEmail = normalizeEmail(email);
  const limiter = rateLimit(`login:${req.headers.get('x-forwarded-for') || 'local'}`, 10, 10 * 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json({ message: 'Too many login attempts. Try again later.' }, { status: 429 });
  }
  if (!normalizedEmail || !password) {
    return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
  }
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ message: 'Invalid email address' }, { status: 400 });
  }
  const user = findUserByEmail(normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordAudit(req as any, null, 'auth.login_failed', 'user', undefined, { email: normalizedEmail });
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }
  if (user.mfaEnabled && user.mfaSecret) {
    const challengeToken = signMfaChallengeToken(user);
    recordAudit(req as any, { id: user.id, tenantId: user.tenantId }, 'auth.mfa_challenge', 'user', user.id, { email: user.email });
    return NextResponse.json({
      mfaRequired: true,
      challengeToken,
      user: { id: user.id, email: user.email, role: user.role }
    });
  }
  const token = signToken(user);
  recordAudit(req as any, { id: user.id, tenantId: user.tenantId }, 'auth.login', 'user', user.id, { email: user.email });
  return NextResponse.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}
