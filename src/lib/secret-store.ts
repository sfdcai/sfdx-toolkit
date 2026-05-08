import crypto from 'node:crypto';
import { jwtSecret } from './config';

type EncryptedPayload = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

function isEncryptedPayload(payload: EncryptedPayload | { sfdxAuthUrl?: string }): payload is EncryptedPayload {
  return (
    typeof (payload as EncryptedPayload).iv === 'string' &&
    typeof (payload as EncryptedPayload).tag === 'string' &&
    typeof (payload as EncryptedPayload).ciphertext === 'string'
  );
}

function getKey() {
  const source = process.env.AUTH_ENCRYPTION_KEY || jwtSecret;
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptSecret(value: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

export function decryptSecret(payload: EncryptedPayload | { sfdxAuthUrl?: string }) {
  if ('sfdxAuthUrl' in payload && typeof payload.sfdxAuthUrl === 'string') {
    return payload.sfdxAuthUrl;
  }
  if (!isEncryptedPayload(payload)) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export function redactAuthSecrets(input: string) {
  return String(input || '').replace(/force:\/\/[^\s"']+/g, 'force://[REDACTED]');
}
