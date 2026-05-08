# SFDX DevOps Platform — Flows

This document describes the exact end‑to‑end workflows implemented in the system.

---

## 1. User Onboarding

1. Register a new account.
2. Login to receive a JWT session.
3. Land on Dashboard.

---

## 2. Project Initialization Flow

1. Create a project in **Project & Orgs**.
2. The system creates three SFDX folders: source, destination, deploy.
3. Select the new project as the active project.

---

## 3. Org Connection Flow

1. Run `sf org display --target-org dev --verbose --json`.
2. Copy `sfdxAuthUrl` into the form.
3. Save org and verify that API version and org info appear.
4. Bind source and destination orgs to the project.

---

## 4. Manifest Flow

1. Generate source manifest from source org.
2. Generate destination manifest from destination org.
3. (Optional) edit or paste a custom manifest.
4. Save manifest.

---

## 5. Retrieve Flow (Chunked)

1. Click **Retrieve source** (or destination).
2. Manifest splits into per‑type chunk manifests.
3. Each type retrieves sequentially.
4. UI shows type status.
5. If needed, stop retrieve and retry.

---

## 6. Compare Flow

1. Click **Generate diff**.
2. System compares source vs destination.
3. Results stored in CSV + delta manifest.
4. UI shows Added/Changed/Removed rows.

---

## 7. Delta Flow

1. Select diff rows you want.
2. Click **Build delta from selection**.
3. The selected source-format metadata is staged into the separate `deploy/` workspace.
4. `deploy/manifest/delta-package.xml` is rebuilt and saved from that reviewed selection.

---

## 8. Deploy Flow

1. Review delta manifest.
2. Set test level or run tests.
3. Deploy from the `deploy/` SFDX project, which contains only the staged delta metadata and destructive changes for this run.
4. If failures occur, auto‑retry removes failing components and re‑deploys.

---

## 9. Admin Flows

### 9.1 Users

- View all users
- Change roles
- Reset passwords
- Delete users (removes all data)

### 9.2 Storage

- View size per project
- Delete projects to reclaim storage

### 9.3 Database

- View tables
- Insert, update, delete rows
