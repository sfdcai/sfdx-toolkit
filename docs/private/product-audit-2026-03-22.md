# Product Audit — 2026-03-22

This audit combines:

- current product behavior in this codebase
- recurring user complaints seen in public Salesforce DevOps discussions
- practical next-step recommendations for this app

## Current Strengths

- Clear end-to-end workflow in one product: org auth, manifest, retrieve, diff, deploy, history
- Better operational guidance than many Salesforce tools: onboarding, readiness gating, translated recovery guidance
- Lower setup complexity than Git-heavy enterprise tools
- Strong admin visibility for a self-hosted product: users, tenants, storage, jobs, health, database tools
- Current integrity protections now catch duplicate aliases, duplicate project names, invalid bindings, and tenant drift

## Current Product Shape

The app is best described as:

- a tenant-metered Salesforce DevOps workspace
- with user-owned projects and orgs
- plus company-style admin controls

This is useful for:

- small internal teams
- admin-heavy teams that want UI over raw CLI
- consulting/demo environments
- self-hosted evaluation or controlled internal usage

It is not yet a full team-shared DevOps platform where many users work directly inside the same shared project namespace.

## What Users Commonly Complain About Elsewhere

Recurring themes from public threads and Q&A around tools like Copado, Gearset, and custom Salesforce deployment setups:

1. Confusing workflows
- Users repeatedly complain that tools become hard to learn, hard to explain, and hard to trust when the workflow is too abstract.

2. Missing or inconsistent metadata capture
- Permission sets, required fields, layouts, and dependency-heavy metadata frequently surprise teams.
- Users often report that a tool "found" a change but failed to move it correctly, or that retrieved metadata is incomplete in ways that are not obvious.

3. Slow deployments and compare operations
- Multiple teams mention long-running compare/deploy cycles and excessive manual support during releases.

4. Poor conflict and back-promotion handling
- Teams struggle when release state drifts across sandboxes and production, especially with partial promotions and follow-up fixes.

5. Raw technical failure messages
- A recurring complaint is that when something breaks, the user has to understand Salesforce metadata internals to recover.

6. Pricing and complexity mismatch
- Many users like enterprise tools only until cost, training burden, or process overhead outweighs the value.

7. Lack of trustworthy audit and drift detection
- Teams value tools that clearly show what changed in the org outside the approved release process.

## Highest-Value Product Extensions

### 1. Release Snapshots and Named Release Packs

Why:

- This app already has compare history and report generation.
- Users need a way to save a reviewed release state and reopen it later.

What to add:

- save a named release pack from selected diff rows
- preserve delta manifest, destructive manifest, report, compare settings, and org context
- allow reopen, compare-against, and redeploy from a saved release pack

Impact:

- turns the product from a one-run utility into a repeatable release system

### 2. Metadata Dependency and Risk Analysis

Why:

- Public complaints often center on deployments failing because dependent metadata was missing or overwritten.

What to add:

- pre-deploy dependency scan
- “this change references components not in the package” warnings
- risk badges for layouts, permission sets, profiles, flows, Apex tests, and destructive changes

Impact:

- reduces failed deployments and builds trust in the generated package

### 3. Drift Detection and Production Change Watch

Why:

- Teams strongly value seeing changes made directly in orgs outside the intended release path.

What to add:

- scheduled compare against last known snapshot
- daily drift report
- highlight “changed in org but not in planned release”
- admin digest for unauthorized or unexpected production changes

Impact:

- makes the product useful between releases, not only during release execution

### 4. Better Permission Set and Layout Handling

Why:

- Public Salesforce discussions repeatedly show confusion around permission set retrieval behavior and layout dependencies.

What to add:

- explicit warnings for metadata API limitations
- permission-set focused compare mode
- layout dependency notes when fields/components are referenced but not packaged
- deployment advisory panels for known problematic metadata classes

Impact:

- closes one of the most common trust gaps in Salesforce deployment tooling

### 5. True Team Workspace Option

Why:

- Current model is shared subscription, separate user workspaces.
- Some customers will expect company-level shared projects.

What to add:

- optional tenant-shared projects
- tenant-scoped uniqueness for project names and org aliases
- per-project membership/permissions
- shared release history and shared org bindings

Impact:

- opens the product to real team collaboration use cases

### 6. Scheduled Checks Beyond Data Integrity

Why:

- Current integrity check covers data consistency.
- Production operation also needs runtime and process checks.

What to add:

- scheduled app health check
- Salesforce CLI availability check
- Caddy/HTTPS certificate check
- disk-space and storage growth warnings
- failed job trend alerts

Impact:

- turns the product into a more production-ready appliance

### 7. Import/Export and Backup UX

Why:

- Self-hosted operators need confidence in recoverability.

What to add:

- one-click backup archive
- restore guidance in UI
- export project package/report bundle
- admin backup health page

Impact:

- increases production trust and lowers support overhead

## Recommended Priority Order

1. Release snapshots and named release packs
2. Dependency and risk analysis
3. Drift detection and scheduled org monitoring
4. Permission-set/layout deployment advisory support
5. Runtime health checks and admin alerts
6. Team-shared workspace model

## Suggested Positioning

Near-term, the strongest positioning is:

- self-hosted Salesforce DevOps workspace
- optimized for small teams and admin/developer mixed teams
- focused on clarity, release safety, and operational visibility

Avoid claiming:

- full enterprise team collaboration parity
- complete metadata intelligence
- turnkey production-grade external access until HTTPS and external reachability are fully verified

## Sources Reviewed

- Reddit discussion on Copado pain points and tool comparisons:
  - https://www.reddit.com/r/SalesforceDeveloper/comments/1bcvzo9
  - https://www.reddit.com/r/salesforce/comments/zq57ff
  - https://www.reddit.com/r/SalesforceDeveloper/comments/1aj9rch
  - https://www.reddit.com/r/salesforce/comments/11by1b2
  - https://www.reddit.com/r/salesforce/comments/1l4dd89
  - https://www.reddit.com/r/salesforce/comments/1jl8btp
- Salesforce Stack Exchange threads on permission set and layout deployment edge cases:
  - https://salesforce.stackexchange.com/questions/112574/permission-sets-metadata-xml-some-field-permissions-missing
  - https://salesforce.stackexchange.com/questions/405610/permission-set-x-of-type-permissionset-failed-to-deploy-due-to-in-field-applica
  - https://salesforce.stackexchange.com/questions/333696/issue-with-creating-a-permission-set-it-adds-every-custom-field-in-the-system
  - https://salesforce.stackexchange.com/questions/380396/filtering-fields-that-can-be-added-to-permission-set
  - https://salesforce.stackexchange.com/questions/54830/migrating-pagelayouts-using-ant
