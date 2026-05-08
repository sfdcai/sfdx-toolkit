export function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+$/.test(email);
}

export function isSafeAlias(value: string) {
  return /^[a-zA-Z0-9_.-]+$/.test(value);
}

export function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isValidSfdxAuthUrl(value: string) {
  return typeof value === 'string' && value.trim().startsWith('force://');
}
