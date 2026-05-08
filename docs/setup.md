# SFDX DevOps Platform — Setup & Operations

This document covers installation, prerequisites, and operations.

---

## 1. Prerequisites

- Node.js 20+
- npm 9+
- Salesforce CLI (`sf`)
- Git (optional)
- PM2 (production)

Verify CLI:

```
sf --version
```

---

## 2. Install Dependencies

```
npm install
```

---

## 3. Run in Development

```
npm run dev
```

App runs on `http://localhost:3000`.

---

## 4. Production (PM2)

```
pm run build
pm2 start npm --name sfdx-devops -- start
```

Check logs:

```
pm2 logs sfdx-devops
```

---

## 5. Data Storage

- SQLite DB: `data/app.db`
- User files: `userdata/<userId>/`
- Legacy JSON (`data/db.json`) only seeds SQLite on first run.

Environment override:

```
DB_FILE=/root/sfdx-toolkit-0.0.1/data/app.db
```

---

## 6. Backup

A full backup can be created with:

```
tar -czf /root/sfdx-toolkit-backup.tar.gz /root/sfdx-toolkit-0.0.1
```

Restore:

```
tar -xzf /root/sfdx-toolkit-backup.tar.gz -C /root
```

---

## 7. JSON → SQLite Migration

If you need to import legacy JSON data into SQLite manually:

```
npm run migrate:json-db
```

Force re-import (overwrites existing rows):

```
npm run migrate:json-db -- --force
```

---

## 8. Roles & Admin

Roles are:

- `super_admin` (platform-wide configuration and tenant limits)
- `company_admin` (manages users/projects within their tenant)
- `user` (standard workflow access)

The first registered user or any address in `adminEmails` becomes `super_admin`.

Change default credentials immediately in production.

Default credentials (development only):

- Super Admin: `superadmin@local` / `Sfdx@Admin123`
- Company Admin: create from Super Admin → Users

Password reset options:

- Admin UI: Super Admin/Company Admin can reset user passwords from the Users screen.
- Email reset: configure SMTP and use the login "Forgot password?" flow.
- CLI reset: `node scripts/reset-password.cjs --email user@example.com --password "NewPass123"`

SMTP environment (for email reset):

```
APP_BASE_URL=https://your-domain
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-pass
SMTP_FROM=no-reply@your-domain
```

Private docs password:

```
PRIVATE_DOCS_PASSWORD=change-this-private-docs-password
```

This password gates the `/private-docs` page.

---

## 9. Code Server

If enabled, Code Server runs on port `8080` with the configured password.

---

## 10. Common Issues

- **CLI not found**: ensure `sf` is on PATH or set `SF_CLI_PATH`.
- **Retrieve failing**: ensure project folders contain `force-app`.
- **Auth fails**: regenerate `sfdxAuthUrl` and re‑add org.
