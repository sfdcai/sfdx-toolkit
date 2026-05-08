import crypto from 'crypto';
import { createPasswordReset, getPasswordResetByTokenHash, markPasswordResetUsed, purgeExpiredPasswordResets } from './store';

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createResetTokenEntry(userId: string, token: string, meta: { ip?: string | null; userAgent?: string | null }) {
  purgeExpiredPasswordResets();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  return createPasswordReset({
    userId,
    tokenHash,
    expiresAt,
    usedAt: null,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null
  });
}

export function consumeResetToken(token: string) {
  purgeExpiredPasswordResets();
  const tokenHash = hashToken(token);
  const record = getPasswordResetByTokenHash(tokenHash);
  if (!record) return null;
  if (record.usedAt) return null;
  if (new Date(record.expiresAt).getTime() < Date.now()) return null;
  markPasswordResetUsed(record.id);
  return record;
}
