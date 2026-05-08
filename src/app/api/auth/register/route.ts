import { NextResponse } from 'next/server';
import { createUser, findUserByEmail } from '@/lib/store';
import { hashPassword, signToken } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail, isValidEmail } from '@/lib/validate';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const normalizedEmail = normalizeEmail(email);
  const limiter = rateLimit(`register:${req.headers.get('x-forwarded-for') || 'local'}`, 5, 15 * 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json({ message: 'Too many registration attempts. Try again later.' }, { status: 429 });
  }
  if (!normalizedEmail || !password) {
    return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
  }
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ message: 'Invalid email address' }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  const existing = findUserByEmail(normalizedEmail);
  if (existing) {
    return NextResponse.json({ message: 'Account already exists' }, { status: 400 });
  }
  try {
    const user = createUser(normalizedEmail, hashPassword(password));
    const token = signToken(user);
    recordAudit(req as any, { id: user.id, tenantId: user.tenantId }, 'auth.register', 'user', user.id, {
      email: user.email
    });
    return NextResponse.json({ token, user: { id: user.id, email: user.email, role: user.role } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    recordAudit(req as any, null, 'auth.register_failed', 'user', undefined, { email: normalizedEmail, reason: message });
    return NextResponse.json({ message }, { status: 403 });
  }
}
