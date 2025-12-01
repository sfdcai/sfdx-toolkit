# SFDX Toolkit

Secure multi-user SFDX automation toolkit that mirrors the finalized architecture for source/destination/delta workspaces, org isolation, and deploy orchestration.

## Features
- JWT-authenticated multi-user API with per-user sandboxed folders under `userdata/<userId>/`.
- Project scaffolding that creates `source`, `destination`, and `deploy` workspaces with manifests and logs.
- Org onboarding that stores auth JSON + org info inside the user's org vault.
- Manifest generation & editing, chunked retrieval with per-type files, diff + CSV export, delta & destructive manifest creation.
- Deployment simulator with test level, check-only, auto-retry, and component filtering plus history tracking.
- PM2 ecosystem with a background metadata worker and an API process.
- UI header bar that shows database, sandbox, and PM2 worker availability as pill buttons.
- Admin endpoints that expose a secure overview of users/projects/orgs and worker logs.

## Getting started
```bash
npm install
npm run start   # starts the API and static dashboard on port 3000
npm run pm2     # runs API + metadata worker under pm2
```

### Configuration
- `JWT_SECRET` — override the default JWT signing secret.
- `ADMIN_EMAILS` — comma-separated list of admin emails (first registered user is admin by default).
- `SF_API_VERSION` — set the API version used for generated manifests (defaults to `59.0`).

## API highlights
- `POST /api/auth/register` → create a user, issue JWT (first user or configured email becomes admin).
- `POST /api/auth/login` → get JWT for subsequent requests.
- `POST /api/projects` → create project, scaffold folders.
- `POST /api/projects/:id/orgs` → attach source/destination org aliases.
- `GET /api/projects/:id/manifests` → fetch source/destination/delta XML.
- `POST /api/projects/:id/manifests/:type/generate` → build package.xml for source/destination/delta from provided metadata types.
- `POST /api/projects/:id/manifests/:type` → persist an edited manifest.
- `POST /api/projects/:id/retrieve/:target` → chunked retrieval that writes metadata files + logs per target.
- `POST /api/projects/:id/compare` → filesystem diff → CSV, delta manifest, destructiveChanges manifest, and history record.
- `POST /api/projects/:id/deploy` → deploy simulator with test level, check-only, auto-retry, and component overrides.
- `GET /api/projects/:id/history` → retrieve retrieval/diff/deploy history.
- `GET /api/admin/summary` (admin) → users/projects/orgs + service snapshot.
- `GET /api/admin/logs` (admin) → metadata worker tail.
- `GET /api/services/status` → status for pills in the top bar.

## Frontend
Open `http://localhost:3000` to see the summarized architecture and a top bar showing service connectivity.

## Security model
- All file paths are validated to stay under the requesting user's `userdata/<userId>` root.
- Projects and orgs are stored per user; queries are filtered by `userId`.
- SFDX-related tasks are scoped to the per-project folders, ensuring clean separation.
