# Release Checklist

Use this checklist before promoting the app to production use.

## Automated Checks

Run these on the server:

```bash
npm run integrity:check
npm run build
```

If the integrity check reports safe-to-fix data issues:

```bash
npm run integrity:fix
```

## UI Smoke Test

Test with these accounts:

- `superadmin@test.local` / `abcd1234`
- `company.admin2@test.local` / `abcd1234`
- `user.one@test.local` / `abcd1234`

Verify these flows:

1. Authentication
- Login works for all three roles.
- Logout clears access.
- Wrong password shows a clean error.

2. Super Admin
- Open `/super-admin`.
- Tenants, users, projects, and health panels load.
- User role change and password reset work.

3. Company Admin
- Open `/admin`.
- Overview, users, projects, orgs, and jobs load.
- Add user and update user role/password work.

4. Standard User
- Can access the main app.
- Cannot access `/admin` or `/super-admin`.

5. Project Workflow
- Create a project.
- Add two different org aliases.
- Bind different source and destination aliases.
- Generate source manifest.
- Generate destination manifest.
- Retrieve source and destination.
- Generate diff.
- Build delta manifest.
- Open report.

6. Guardrails
- Try binding the same alias as both source and destination. This should fail.
- Try adding a duplicate org alias for the same user. This should fail.
- Try creating a duplicate project name for the same user. This should fail.

## HTTPS Readiness

For `sfdx.duckdns.org`, verify:

```bash
systemctl status caddy --no-pager
journalctl -u caddy -n 50 --no-pager
```

If certificate issuance fails with `Connection refused`, fix router/firewall forwarding for:

- TCP `80`
- TCP `443`

## Scheduled Integrity Check

The server should run:

```bash
/usr/bin/node /root/sfdx-toolkit-0.0.1/scripts/integrity-check.cjs --fix --json
```

This is suitable for a systemd timer or cron job.
