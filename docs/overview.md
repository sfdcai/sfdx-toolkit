# SFDX DevOps Platform — Overview

The SFDX DevOps Platform is a web‑based toolkit for Salesforce metadata operations. It provides a guided, multi‑user workflow for generating manifests, retrieving metadata, comparing orgs, building delta packages, and deploying changes. The platform is designed to be self‑contained per user, with a strict filesystem sandbox and clear separation between source, destination, and deploy workspaces.

---

## Goals

- Make Salesforce metadata operations repeatable, visual, and auditable.
- Keep every user isolated to their own workspace.
- Run real `sf` CLI commands with transparent output and logs.
- Provide admin controls for system health and storage management.

---

## Core Experience

1. **Project & Org Setup**
   - Create a project and store it inside your user root.
   - Add orgs by pasting an `sfdxAuthUrl`.
   - Bind a source and destination org to the project.

2. **Manifest Generation**
   - Generate manifests directly from org metadata.
   - Edit manifests inline and save updates.

3. **Chunked Retrieve**
   - Split manifests per metadata type.
   - Retrieve per type and track success/failure in the UI.

4. **Diff & Delta**
   - Compare source and destination workspaces.
   - Filter by status and metadata type.
   - Build a delta manifest from selected changes.
   - Generate an HTML comparison report with actionable insights.

5. **Deploy**
   - Deploy the delta package.
   - Optionally run tests or check‑only validation.
   - Auto‑retry by removing failing components.

---

## Admin Experience

- View all users and change roles.
- Reset user passwords or delete accounts.
- Review project storage usage and delete old projects.
- Inspect the SQLite database through the web UI.
- Review upgrade requests and approve plan changes.

---

## Key Design Principles

- **Isolation**: Users can never access another user's data.
- **Transparency**: CLI output is shown in a dedicated console.
- **Predictability**: All operations are done inside defined user folders.
- **Recoverability**: Projects are fully self‑contained and movable.

---

## Documentation Map

- `docs/user-guide.md` — Full walkthrough of every section.
- `docs/setup.md` — Installation, prerequisites, backup/restore.
- `docs/architecture.md` — Runtime structure, data flow, and modules.
- `docs/security.md` — Authentication, sandboxing, and isolation model.
- `docs/api.md` — API endpoints and request patterns.
- `docs/ui.md` — UI layout and behaviors.
- `docs/flows.md` — End‑to‑end workflow descriptions.
- `docs/features.md` — Feature catalog and status.
- `docs/subscriptions.md` — Subscription plans and SaaS roadmap.
