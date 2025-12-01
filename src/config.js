export const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-me';
export const dataFile = 'data/db.json';
export const userRoot = 'userdata';
export const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);
export const apiVersion = process.env.SF_API_VERSION || '59.0';
