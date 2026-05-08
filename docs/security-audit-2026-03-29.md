# Security Audit And Hardening Status

Date: 2026-03-29

## Current Audit Findings

### Fixed In This Pass

1. Super-admin DB table access was vulnerable to SQL injection through interpolated table names.
   - Fixed by enforcing an allowlist in `src/lib/db.ts`.
   - `listTables`, `tableRows`, `tableInfo`, `insertRow`, `updateRow`, and `deleteRow` now reject unknown tables.

2. Salesforce auth material was stored in plaintext on disk.
   - Fixed by encrypting the stored auth payload in `auth.json` with AES-256-GCM using native Node.js `crypto`.
   - The decryption path remains backward compatible with older plaintext payloads.
   - Auth logs now redact `force://...` secrets.
   - Temporary `sfdxAuthUrl.txt` files are removed after successful CLI login.

3. The app had no explicit HTTP hardening headers.
   - Added HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a baseline Content Security Policy in `next.config.js`.

4. MFA was not available.
   - Added opt-in TOTP MFA using free packages `otplib` and `qrcode`.
   - Added database support for `mfa_secret` and `mfa_enabled`.
   - Added MFA setup and verification routes.
   - Added login challenge flow for MFA-enabled users.
   - Added profile UI controls to generate QR setup, verify, enable, and disable MFA.

## Files Changed

- `src/lib/db.ts`
- `src/lib/secret-store.ts`
- `src/lib/store.ts`
- `src/lib/auth.ts`
- `src/lib/mfa.ts`
- `src/app/api/orgs/route.ts`
- `src/app/api/orgs/[alias]/route.ts`
- `src/app/api/orgs/[alias]/auth/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/mfa/setup/route.ts`
- `src/app/api/auth/mfa/verify/route.ts`
- `src/app/page.tsx`
- `next.config.js`

## Validation

- `npm run build` completed successfully on 2026-03-29 after the hardening and MFA changes.

## Remaining Recommended Work

1. Re-audit all admin and company-admin routes for tenant scoping, not just project and org routes.
2. Refine login rate limiting so only failed attempts count against the bucket and IP extraction is normalized behind proxies.
3. Add MFA recovery codes and a forced re-verification step for disable/reset actions if stricter account protection is required.
4. Add focused tests for:
   - DB admin allowlist enforcement
   - encrypted auth payload round-trips
   - MFA login challenge flow
   - MFA setup enable/disable flow
5. If off-server backup is required, push the codebase to a git remote or object storage instead of relying only on a local archive.

## Backup Snapshot

A local backup archive was created at:

- `backups/sfdx-toolkit-2026-03-29.tar.gz`
