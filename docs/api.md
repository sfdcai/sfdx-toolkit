# SFDX DevOps Platform — API Reference

This document lists the main API endpoints and their purpose. All endpoints expect a JWT in the `Authorization: Bearer <token>` header unless noted.

---

## Auth

- `POST /api/auth/register` — register user
- `POST /api/auth/login` — login user

---

## Projects

- `GET /api/projects` — list projects
- `POST /api/projects` — create project
- `PATCH /api/projects/:id` — rename project
- `DELETE /api/projects/:id` — delete project
- `POST /api/projects/:id/orgs` — attach source/destination
- `GET /api/projects/:id/manifests` — load manifests
- `POST /api/projects/:id/manifests/:type` — save manifest (source/destination/delta)
- `POST /api/projects/:id/manifests/:type/generate` — generate manifest
- `POST /api/projects/:id/manifests/validate` — validate + normalize manifest XML for deploy-ready package format
- `POST /api/projects/:id/retrieve/:target` — run retrieve (chunked)
- `GET /api/projects/:id/retrieve/:target/status` — retrieve status
- `POST /api/projects/:id/retrieve/:target/stop` — stop retrieve
- `GET /api/projects/:id/retrieve/:target/members` — list members per type
- `POST /api/projects/:id/compare` — generate diff + delta
- `GET /api/projects/:id/report` — read HTML comparison report
- `POST /api/projects/:id/delta` — build delta from selection
- `POST /api/projects/:id/deploy` — deploy delta
- `GET /api/projects/:id/history` — history for project
- `GET /api/projects/:id/logs` — read log file
- `GET /api/projects/:id/files` — read file from source/destination

---

## Orgs

- `GET /api/orgs` — list orgs
- `POST /api/orgs` — add org
- `GET /api/orgs/:alias` — org details
- `PATCH /api/orgs/:alias` — refresh org auth / rename alias
- `DELETE /api/orgs/:alias` — delete org
- `GET /api/orgs/:alias/auth` — reveal stored auth URL

---

## Admin

- `GET /api/admin/users` — list users
- `PATCH /api/admin/users` — update role
- `POST /api/admin/users` — reset password
- `PUT /api/admin/users` — create user
- `DELETE /api/admin/users` — delete user
- `GET /api/admin/projects` — project storage usage
- `DELETE /api/admin/projects` — delete project (admin)
- `GET /api/admin/tenants` — list tenants + usage
- `PATCH /api/admin/tenants` — update tenant plan/limits
- `DELETE /api/admin/tenants` — delete tenant + cleanup
- `GET /api/admin/upgrades` — list upgrade requests
- `POST /api/admin/upgrades` — approve/reject upgrade request
- `GET /api/admin/settings` — admin defaults
- `PATCH /api/admin/settings` — update admin defaults

---

## Database (Admin)

- `GET /api/db/overview` — db stats
- `GET /api/db/tables` — list tables
- `GET /api/db/table` — table rows
- `POST /api/db/row` — insert row
- `PATCH /api/db/row` — update row
- `DELETE /api/db/row` — delete row

---

## Docs

- `GET /api/docs/list` — list docs
- `GET /api/docs/file` — render markdown to HTML

---

## Services

- `GET /api/services/status` — system status (db, sandbox, sf CLI)

## Usage

- `GET /api/usage` — tenant usage + limits (current user)
- `POST /api/upgrade/request` — request plan upgrade

## Company Admin

- `GET /api/company-admin/summary` — tenant usage + limits
- `GET /api/company-admin/users` — list tenant users
- `POST /api/company-admin/users` — create tenant user
- `PATCH /api/company-admin/users` — update user role/password
- `GET /api/company-admin/projects` — list tenant projects
- `DELETE /api/company-admin/projects` — delete tenant project
- `GET /api/company-admin/orgs` — list tenant orgs
