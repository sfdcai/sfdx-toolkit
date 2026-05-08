export const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-me';
export const dataFile = 'data/db.json';
export const dbFile = process.env.DB_FILE || 'data/app.db';
export const userRoot = 'userdata';
export const apiVersion = process.env.SF_API_VERSION || '65.0';
export const sfCliPath = process.env.SF_CLI_PATH || '/root/cli/sf/bin/sf';
export const privateDocsPassword = process.env.PRIVATE_DOCS_PASSWORD || 'amit';
export const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
