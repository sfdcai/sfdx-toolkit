import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { jwtSecret } from './config';
import type { UserRecord } from './store';

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user: UserRecord) {
  return jwt.sign({ id: user.id, tenantId: user.tenantId, email: user.email, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, jwtSecret) as { id: string; tenantId: string; email: string; role: string };
}

export function signMfaChallengeToken(user: UserRecord) {
  return jwt.sign(
    { scope: 'mfa_challenge', id: user.id, tenantId: user.tenantId, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn: '10m' }
  );
}

export function verifyMfaChallengeToken(token: string) {
  const payload = jwt.verify(token, jwtSecret) as { scope?: string; id: string; tenantId: string; email: string; role: string };
  if (payload.scope !== 'mfa_challenge') {
    throw new Error('Invalid MFA challenge token');
  }
  return payload;
}

export function signPrivateDocsToken() {
  return jwt.sign({ scope: 'private_docs' }, jwtSecret, { expiresIn: '12h' });
}

export function verifyPrivateDocsToken(token: string) {
  try {
    const payload = jwt.verify(token, jwtSecret) as { scope?: string };
    return payload.scope === 'private_docs';
  } catch {
    return false;
  }
}
