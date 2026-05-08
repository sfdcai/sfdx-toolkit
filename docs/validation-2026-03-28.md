# Validation Report — 2026-03-28

Environment:

- Workspace: `/root/sfdx-toolkit-0.0.1`
- App validation target: local Next.js production server
- Salesforce auth source: [`environments.md`](/root/sfdx-toolkit-0.0.1/environments.md)
- Validation harness: [`scripts/validate-e2e.cjs`](/root/sfdx-toolkit-0.0.1/scripts/validate-e2e.cjs)

## Code fixes applied during validation

1. Salesforce CLI child processes now run with a writable CLI home/state directory.
   Files:
   [`src/lib/sf.ts`](/root/sfdx-toolkit-0.0.1/src/lib/sf.ts)
   [`src/lib/metadata.ts`](/root/sfdx-toolkit-0.0.1/src/lib/metadata.ts)
   [`src/lib/deploy.ts`](/root/sfdx-toolkit-0.0.1/src/lib/deploy.ts)
   [`src/app/api/orgs/route.ts`](/root/sfdx-toolkit-0.0.1/src/app/api/orgs/route.ts)
   [`src/app/api/orgs/[alias]/route.ts`](/root/sfdx-toolkit-0.0.1/src/app/api/orgs/[alias]/route.ts)
   [`src/app/api/projects/[id]/retrieve/[target]/members/route.ts`](/root/sfdx-toolkit-0.0.1/src/app/api/projects/[id]/retrieve/[target]/members/route.ts)
   [`src/app/api/services/status/route.ts`](/root/sfdx-toolkit-0.0.1/src/app/api/services/status/route.ts)
   [`src/app/api/admin/health/route.ts`](/root/sfdx-toolkit-0.0.1/src/app/api/admin/health/route.ts)

2. Manifest generation now fails with an explicit timeout instead of hanging indefinitely.
   File:
   [`src/lib/metadata.ts`](/root/sfdx-toolkit-0.0.1/src/lib/metadata.ts)

3. Async retrieve status now honors non-zero `sf` exit codes instead of falsely reporting success.
   File:
   [`src/lib/metadata.ts`](/root/sfdx-toolkit-0.0.1/src/lib/metadata.ts)

4. Deploy staging now includes companion `-meta.xml` files and full `lwc`/`aura` bundles.
   File:
   [`src/lib/deploy.ts`](/root/sfdx-toolkit-0.0.1/src/lib/deploy.ts)

## What was exercised successfully

- Public docs and guide APIs
- Private docs login/list/file/logout
- Register, login, forgot-password request, reset-password, profile update, password change
- Usage and upgrade-request submission
- Org add, org read, stored auth read, org refresh
- Project create, rename, list, attach orgs
- Manual manifest save/read
- Metadata member discovery via Salesforce CLI
- Source retrieve
- Destination retrieve in at least one successful run
- File read, log read
- Synchronous compare
- Delta build
- HTML report fetch
- Async compare job start/status
- Admin health, summary, settings, limits, usage, storage, audit, users list, projects list, tenants list/create/update, upgrades list/approve, feature flags, DB overview/tables/table/row CRUD
- Company-admin summary, users list/create/update, projects list, orgs list, feature flags, AI-insights list, static-scans list, org-docs list, jobs list/stop/clear

## Findings from live validation

### 1. Manifest generation against the provided org is not completing in a reasonable time

Observed behavior:

- `POST /api/projects/:id/manifests/source/generate`
- `POST /api/projects/:id/manifests/destination/generate`

Both calls timed out during live validation against the provided org auth.

Current behavior after the fix:

- The endpoint returns a clear `500` with `Manifest generation timed out after ...ms.`
- It no longer hangs the request indefinitely.

Status:

- Improved failure mode
- Still not a functional pass for this specific org/workflow

### 2. Async retrieve previously masked real Salesforce CLI failures

Observed behavior before the fix:

- Destination retrieve hit a Salesforce DNS failure (`EAI_AGAIN`)
- The status file still marked the chunk as `Retrieved`

Current behavior after the fix:

- Non-zero CLI exit now records `Failed`
- Downstream flows can no longer trust a false-success retrieve status

Status:

- Fixed in code
- Needs a fresh full rerun for final end-to-end confirmation

### 3. Deploy staging was too narrow for source-format metadata

Observed behavior before the fix:

- Deploy returned `Failed` in the validation run
- The staging logic copied only the selected changed file path
- That can omit required companion files such as `*.cls-meta.xml`

Current behavior after the fix:

- Companion metadata files are staged automatically
- `lwc` and `aura` bundle directories are staged as a unit

Status:

- Fixed in code
- A later full validation run still returned `deploy.status = Failed`, so there is at least one additional deploy-time issue or org/environment constraint beyond the staging bug
- The deploy route itself executed and returned structured output, but a successful end-to-end validation is still outstanding

### 4. Full validation run reached the final cleanup stage

The latest validator run exercised the full suite through:

- auth
- docs/private docs
- org add/read/refresh/delete
- project create/rename/delete
- manual manifest save/read
- retrieve source/destination
- compare sync/async
- delta build
- deploy route invocation
- admin endpoints
- company-admin endpoints
- DB CRUD endpoints

The final script error was:

- `admin.tenants.delete -> 404 Tenant not found`

That happened because the validator intentionally called `admin.tenants.cleanup_empty` first, and that cleanup removed the just-created empty tenant before the explicit delete step ran.

Status:

- Harness ordering issue
- Not a product defect

## Non-product issues observed during validation

- One earlier validator run called `admin.tenants.cleanup_empty` before `admin.users.post`, which correctly removed the empty tenant and caused the later user-create step to fail. The harness was updated.
- The latest validator run still ends with an expected `404` when trying to explicitly delete a tenant that `cleanup_empty` had already removed. This is also a harness-order issue, not an app bug.

## Current conclusion

- Most major flows are working with the provided `sfdxAuthUrl`.
- Two real product issues were found and patched during this session:
  - false-success retrieve status
  - incomplete deploy staging
- One product issue remains unresolved for this org:
  - manifest generation from org times out
- One additional workflow still needs deeper follow-up:
  - deploy route returns `Failed` in live validation even after the staging fix

## How to rerun

1. Build:

```bash
npm run build
```

2. Start the app with a writable Salesforce CLI home and a manifest timeout:

```bash
HOME=/tmp SF_MANIFEST_TIMEOUT_MS=15000 npm run start -- --hostname 127.0.0.1 --port 3004
```

3. Run the validator:

```bash
APP_BASE_URL=http://127.0.0.1:3004 node scripts/validate-e2e.cjs
```
