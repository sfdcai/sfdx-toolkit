# SFDX DevOps Platform — UI Guide

This document explains the UI layout and how navigation is structured.

---

## Layout Overview

- **Left Sidebar**: workflow navigation (Dashboard, Profile, Project & Orgs, Manifest, Retrieve, Diff, Deploy, History)
- **Right Panel**: content and the top bar
- **Top Bar**: theme selector, user status, Docs and Logout (system status pills live in admin consoles)
- **Guide Rail**: contextual help banner and collapsible section guides explain what to do next inside the app
- **Recovery Guidance**: translated error panel provides plain-language troubleshooting steps after common failures

---

## Sections

### Dashboard

Shows:

- Project count
- Org count
- Active project
- Deploy status
- Retrieve and diff indicators
- Current workflow guidance for the active section

### Profile

Shows:

- Email, role, user ID
- Project and org counts
- Active project

### Project & Orgs

- Project creation and selection
- Org addition with sfdxAuthUrl
- Bind source and destination
- Org details panel
- Inline edit/refresh/delete org
- Projects overview with rename and delete
- Setup checklist explaining what must be complete before downstream actions

### Manifest Generation

- Source and destination manifests
- Generate from org
- Save edits
- In-app explanation of manifest scope and compare strategy usage

### Retrieve

- Chunked per type
- Status indicators
- Click a type to view members
- Stop retrieve
- Guided sequence for source and destination retrieves

### Diff & Delta

- Table of changes with status
- Filters by type and status
- Build delta manifest from selection
- Source/Destination presence columns
- Open HTML report for detailed analysis
- Contextual guidance on filtering noise and selecting deployable scope
- Readiness panel that explains missing prerequisites and links to the section that fixes them

### Diff Viewer

- Side‑by‑side diff
- File list with status
- Filters and search
- Recovery guidance panel for missing project context, compare failures, and file load errors

### Deploy

- Delta manifest editor
- Test level and run tests
- Deploy and retry
- Validation guidance for test levels, check-only mode, and retry behavior
- Readiness gating that blocks deployment until required project, diff, and delta conditions are met

### History

- Summary of retrieve, compare, deploy logs
- Guidance for audit and troubleshooting workflows

### Super Admin Console

- Tenant-level usage + plan limits
- Approve or reject upgrade requests
- View users, tenants, and projects
- Storage cleanup and database editor
- Recovery guidance panel for API failures, limits issues, auth problems, and database editor errors

### Company Admin Console

- Tenant usage dashboard
- Add/manage users in tenant
- View projects and orgs
- Recovery guidance panel for tenant API failures and service issues

---

## Theme System

Themes are built using CSS variables and can be switched from the top bar:

- Light
- Dark
- Sand
- Slate
