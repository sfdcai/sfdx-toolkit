# SFDX DevOps Platform — Architecture

This document describes the platform architecture, runtime topology, and how data flows through the system.

---

## 1. Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **UI:** Tailwind CSS + custom theme tokens
- **Database:** SQLite (`data/app.db`) via `better-sqlite3`
- **CLI:** Salesforce `sf` CLI
- **Process:** Node/PM2 (production)

---

## 2. Runtime Topology

The system runs as a single Next.js application:

- **UI:** React client in `src/app/page.tsx`.
- **API:** Next.js route handlers in `src/app/api/**`.
- **Domain logic:** Library functions in `src/lib/**`.
- **Storage:** User folders on disk + SQLite metadata.

---

## 3. Multi‑User Isolation

Each user has a root folder:

```
/userdata/<userId>/
  projects/
  orgs/
  settings.json
```

All filesystem access is sandboxed by:

- `resolveUserPath()` for path validation
- Server‑side enforcement of userId
- Never reading outside `userdata/<userId>`

---

## 4. Project Layout

Each project has three fully isolated SFDX workspaces:

```
/userdata/<userId>/projects/<projectName>/
  source/
    manifest/package.xml
  destination/
    manifest/package.xml
  deploy/
    manifest/delta-package.xml
    logs/
```

The workspace root itself is the SFDX package directory for all three folders. Retrieved and staged metadata lives directly under `source/`, `destination/`, and `deploy/` in source format such as `classes/`, `objects/`, `lwc/`, `aura/`, and `settings/`.

Why three workspaces:

- Source and destination metadata never mix.
- The deploy workspace is a separate delta SFDX project built from reviewed diff selection.
- Clean deploy staging is always available.

---

## 5. Org Storage

Each org is stored per user:

```
/userdata/<userId>/orgs/<alias>/
  auth.json
  org-info.json
  auth.log
```

`auth.json` stores the `sfdxAuthUrl` (used only on refresh).

---

## 6. Domain Modules

- **Manifests**: Generate, edit, and save `package.xml`.
- **Retrieve**: Chunked per type; status tracked in JSON.
- **Compare**: Diff source vs destination, create CSV and delta.
- **Deploy**: Deploy delta with optional tests and auto‑retry.
- **Admin**: Users, DB UI, storage manager, upgrade requests.

---

## 7. Data Flow (High Level)

1. UI calls API route
2. API route uses `src/lib/*` helpers
3. CLI commands run inside user folder
4. Output is written to logs or returned to client
5. Client renders results and provides editable views

---

## 8. Persistence

- **SQLite** stores users, projects, orgs, comparisons, retrievals, deployments.
- **Filesystem** stores raw metadata and large artifacts.

---

## 9. Observability

- CLI output is saved to log files per job.
- Logs are surfaced in the CLI Console panel.

---

## 10. Next Architecture Steps (Optional)

Future upgrades may include:

- Async job queue for long‑running tasks
- Redis + BullMQ for background jobs
- Storage abstraction for S3/Blob
- Postgres for multi‑tenant scaling
