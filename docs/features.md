# SFDX DevOps Platform — Feature Catalog

This document lists all platform features and their current behavior.

---

## Authentication & Accounts

- Register new users
- Login with JWT token
- Admin role assignment (first user or configured admin email)
- User profile view

---

## Project Management

- Create projects (per user)
- Select active project
- Rename projects
- Delete projects
- Projects are stored inside the user root only

---

## Org Management

- Add orgs via `sfdxAuthUrl`
- View org details (API version, username, org id, instance)
- Refresh org details (re‑auth with new URL)
- Rename org alias
- Delete org

---

## Manifest Generation

- Generate source manifest from source org
- Generate destination manifest from destination org
- Inline manifest editing
- Save manifests back to disk

---

## Metadata Retrieve

- Chunked retrieve per metadata type
- Status tracking for each type (queued/running/retrieved/failed)
- Type‑level click‑through to member list
- Stop running retrieve

---

## Diff & Delta

- Compare source and destination metadata
- Added / Changed / Removed status
- Filter by type or status
- Build delta from selected changes
- Save delta manifest
- Source/Destination presence indicators
- HTML comparison report (actionable summary + change list)

---

## Diff Viewer

- Side‑by‑side visual comparison
- File list with status and source/destination presence
- Filter by folder/type and keyword

---

## Deploy

- Deploy delta manifest
- Set test level
- Run specified tests
- Check‑only validation
- Auto‑retry by removing failed components

---

## History

- Retrieval history (per project)
- Comparison history (per project)
- Deployment history (per project)

---

## Admin Features

- User list with role management
- Reset user passwords
- Delete users (with data cleanup)
- Database UI for CRUD
- Project storage usage report
- Delete projects to reclaim disk space
- Upgrade request review (approve/reject)

---

## System Services

- Database status
- Sandbox status
- Salesforce CLI status + version

## Subscription & Upgrade

- Per-tenant usage limits (users, projects, orgs, storage, retrieves, deploys)
- Upgrade request submission (free users)
- Super admin approval or rejection
