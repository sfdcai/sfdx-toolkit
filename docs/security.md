# SFDX DevOps Platform — Security Model

This document outlines authentication, authorization, data isolation, and operational security controls.

---

## 1. Authentication

- Users authenticate with email + password.
- Passwords are hashed using bcrypt (`bcryptjs`).
- Sessions use JWT with a 7‑day expiry.

---

## 2. Authorization

- Every API route checks the JWT token.
- Role‑based rules:
  - **user**: access to own projects and orgs only
  - **admin**: system‑level actions, user management, storage cleanup

---

## 3. Filesystem Isolation

Each user has a dedicated root:

```
/userdata/<userId>/
  projects/
  orgs/
```

All file paths are resolved through `resolveUserPath`, which prevents traversal outside the user root. This ensures:

- No access to other users’ data
- No access to system files

---

## 4. Data Isolation

All database queries include `user_id` filters. Examples:

- `SELECT * FROM projects WHERE user_id = currentUserId`
- `SELECT * FROM orgs WHERE user_id = currentUserId`

---

## 5. CLI Execution Safety

- All `sf` CLI commands run inside user folders.
- Org auth is stored per user and never shared.
- CLI outputs are written to logs for auditing.

---

## 6. Admin Privileges

Admins can:

- View all users
- Modify roles
- Reset passwords
- Delete projects and users

Admins **cannot access another user’s metadata** unless explicitly reading files from disk (not available in UI).

---

## 7. Recommended Hardening (Optional)

- Move JWT from localStorage to httpOnly cookies.
- Add CSRF protection for all POST/PATCH/DELETE routes.
- Add database uniqueness constraints:
  - `(user_id, alias)` in orgs
  - `(user_id, name)` in projects
- Add log sanitization to remove auth tokens.
- Encrypt `sfdxAuthUrl` at rest.

