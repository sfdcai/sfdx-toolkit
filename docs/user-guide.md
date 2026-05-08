# SFDX DevOps Platform — User Guide

This is a comprehensive walkthrough of every screen and workflow in the platform.

---

## 1. Login & Register

- Open the application and sign in.
- New users can click **Create an account** on the login card.
- Use **Forgot password?** to request a reset link (requires SMTP setup).
- After login you are redirected to the **Dashboard**.

Current users (from database):

- `superadmin@test.local` (super_admin)
- `company.admin1@test.local` (company_admin)
- `company.admin2@test.local` (company_admin)
- `company.admin3@test.local` (company_admin)
- `user.one@test.local` (user)
- `user.two@test.local` (user)
- `user.three@test.local` (user)

Default test password for all current accounts:

- `abcd1234`

Current test tenants:

- `Platform Default`
- `Test Company One`
- `Test Company Two`
- `Test Company Three`
- `Test User Workspace One`
- `Test User Workspace Two`
- `Test User Workspace Three`

---

## 2. Dashboard

The dashboard provides a summary of your environment:

- **Projects**: total count
- **Orgs**: total count
- **Active project**: name + status
- **Last deploy**: status and attempt count
- **Retrieve status**: recent retrieve state
- **Diff status**: number of changes loaded
- **Guided workflow banner**: section-specific help and next steps
- **Onboarding checklist**: milestone-based setup progress for first-time users

Use the **Refresh** button if you just made changes in another section.

Most workflow sections also include a collapsible in-app guide. Use the `i` button to collapse or reopen the help panel for that section.

Login state is also saved locally in the browser so users can resume their last session and section more easily.

Compare, diff, and deploy flows now show readiness panels when prerequisites are missing. These panels explain what is blocking the action and provide direct navigation to the section that needs attention.

When a request fails, the app also shows a recovery guidance panel that translates common technical errors into plain-language next steps.

If you are on the free tier, the **Usage & Plan** panel shows:

- Current plan
- Usage vs limits (users, projects, orgs, storage, retrieves, deploys)
- Buttons to request Pro or Enterprise upgrades

---

## 3. Profile

Shows your user information:

- Email address
- Role (user/admin)
- User ID
- Workspace counts and active project

You can change your password in the **Reset Password** panel.

---

## 4. Project & Orgs

### 4.1 Create Project

- Enter a project name.
- Click **Create project**.

A project creates three SFDX workspaces:

- `source/`
- `destination/`
- `deploy/`

### 4.2 Select Project

Use the dropdown to set the active project.

### 4.3 Projects Overview

This table provides inline editing:

- Rename projects in place and click **Save**.
- Select a project with **Select**.
- Delete projects with **Delete**.

### 4.4 Add Org

Retrieve your `sfdxAuthUrl` with:

```
sf org display --target-org dev --verbose --json
```

Then:

- Enter an alias.
- Paste the `sfdxAuthUrl`.
- Click **Save org**.

### 4.5 Bind Orgs

Assign orgs for comparison:

- Source org
- Destination org

Click **Attach orgs** to save.

### 4.6 Org Details

Select an org to view:

- API version
- Username
- Org ID
- Instance URL
- Sandbox flag
- Raw JSON metadata

Use **Edit org** to refresh auth or rename alias. The platform re‑authenticates and updates `org-info.json`.

---

## 5. Manifest Generation

Each project uses two manifests:

- Source manifest
- Destination manifest

Actions:

- **Generate**: build `package.xml` from the org.
- **Save**: write the manifest to disk.

You can paste custom XML directly into the editor and save it.

---

## 6. Retrieve (Chunked)

Retrieval is performed per metadata type for stability.

Flow:

1. Click **Retrieve source** (or destination).
2. The platform generates per‑type chunk manifests.
3. Each type is retrieved sequentially.
4. Status indicators show progress:
   - Queued
   - Running
   - Retrieved
   - Failed
5. Click a type to inspect members.
6. Click **Stop retrieve** to cancel.

---

## 7. Diff & Delta

### 7.1 Generate Diff

Click **Generate diff**. The system:

- Compares source vs destination folders
- Produces a CSV log in `deploy/logs/comparison.csv`
- Generates a delta manifest
- Creates an HTML comparison report (open via **Open report**)

### 7.2 Table Columns

- **Type**: metadata type
- **Name**: component name
- **Status**: Added / Changed / Removed
- **Source / Destination**: presence indicators
- **Path**: relative file path

### 7.3 Filtering

- Filter by status or type
- Search by type/name/path

### 7.4 Build Delta

- Select rows you want
- Click **Build delta from selection**
- The delta manifest is rebuilt

---

## 8. Diff Viewer

The diff viewer provides side‑by‑side comparison:

- File list with status and source/destination presence
- Filter by type (folder) or keyword
- Click a file to render the diff
- If loading fails, a recovery guidance panel explains whether the problem is missing project context, expired auth, or compare/retrieve prerequisites

---

## 9. Docs & Reports

- The built-in Docs screen lists project markdown and rendered HTML docs.
- The report screen shows the generated HTML comparison report for a project.
- If either screen fails to load, the app now shows recovery guidance with plain-language next steps instead of only raw error text

## 10. Deploy

The delta manifest lives in Deploy:

- Review or edit the XML.
- Select test level and run tests.
- Optionally set check‑only.
- Click **Deploy delta**.

If errors occur:

- The system can auto‑retry by removing failing components.

## 11. History

Displays:

- Retrieve history
- Compare history
- Deployment history

## 12. Admin: Users

Admins can:

- List all users
- Change roles
- Reset passwords
- Delete users

Both admin consoles now include recovery guidance panels when API calls fail, sessions expire, tenant limits block an action, or the database editor receives invalid input.

Deleting a user removes all associated data and folders.

## 13. Admin: Database

SQLite table viewer:

- Read rows
- Insert new rows
- Update or delete rows

## 14. Admin: Storage

View storage usage per project:

- Project name
- Owner
- Size on disk

Delete projects to reclaim disk space.

---

## 14. CLI Console

Shows:

- CLI output
- Retrieve/deploy logs

Use **Clear** to reset output.

## 15. AI Ops Features

- The **Admin** and **Company Admin** consoles expose premium feature flags. Toggle **AI Deployment Insights**, **Enhanced Static Scanning**, and **Org Design Documents** per tenant.
- When a flag is enabled, fresh insights are generated via the scheduled CLI job `npm run ai:insights`, which scans failed jobs, summarizes the failure, and stores a recommendation for the UI.
- Every insight shows the raw CLI error plus a short recommendation so support engineers can act faster. The super-admin console lets you toggle flags for any tenant and view their generated insights side-by-side.

## 16. Static Scan & Reporting

- `npm run scan:static` walks through the codebase, flags TODOs, console logs, debugger statements, and eval usage, and writes a JSON report under `data/static-scans`.
- Static scan results appear in the admin consoles within the **Static Scans** section, including the status, summary, and report path so you can download and distribute it.
- Billing-wise each scan is treated as a premium unit when the **Enhanced Static Scan** feature flag is enabled.

## 17. Org Design Documents

- `npm run doc:org` gathers tenant metadata (projects, org aliases, diff results, deployments) and produces a Markdown design brief in `data/org-docs`.
- The **Org Docs** section surfaces each generated document with timestamps and file paths so you can snapshot architecture, hand it to stakeholders, or include it in release notes.
- Combine deployment insights, scans, and docs to deliver a fully audited release story without writing a single word manually.
