# SFDX Toolkit

Secure multi-user SFDX automation toolkit that mirrors the finalized architecture for source/destination/delta workspaces, org isolation, and deploy orchestration.

## Features
- JWT-authenticated multi-user API with per-user sandboxed folders under `userdata/<userId>/`.
- Project scaffolding that creates `source`, `destination`, and `deploy` workspaces with manifests and logs.
- Org onboarding that stores auth JSON inside the user's org vault.
- Manifest editing, chunked retrieval stubs, diff generation, delta manifest saving, and deploy logging.
- PM2 ecosystem with a background metadata worker and an API process.
- UI header bar that shows database, sandbox, and PM2 worker availability as pill buttons.

## Getting started
```bash
npm install
npm run start   # starts the API and static dashboard on port 3000
npm run pm2     # runs API + metadata worker under pm2
```

## API highlights
- `POST /api/auth/register` → create a user, issue JWT.
- `POST /api/auth/login` → get JWT for subsequent requests.
- `POST /api/projects` → create project, scaffold folders.
- `POST /api/projects/:id/orgs` → attach source/destination org aliases.
- `POST /api/projects/:id/manifests/:type` → save source/destination/delta manifests.
- `POST /api/projects/:id/retrieve/:target` → stubbed chunked retrieval log.
- `POST /api/projects/:id/compare` → generate comparison CSV and delta manifest path.
- `POST /api/projects/:id/deploy` → simulate deploy log in the isolated deploy folder.
- `GET /api/services/status` → status for pills in the top bar.

## Frontend
Open `http://localhost:3000` to see the summarized architecture and a top bar showing service connectivity.

## Security model
- All file paths are validated to stay under the requesting user's `userdata/<userId>` root.
- Projects and orgs are stored per user; queries are filtered by `userId`.
- SFDX-related tasks are scoped to the per-project folders, ensuring clean separation.
