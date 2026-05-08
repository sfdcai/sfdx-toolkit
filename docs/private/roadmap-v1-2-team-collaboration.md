# Roadmap — V1.2 Team Collaboration

Focus: moving from shared subscription to stronger shared-workspace behavior.

## Goals

- support true company/team workflows, not only tenant billing with user-owned workspaces
- make collaboration and approvals first-class

## Work Items

- decide target model:
  - tenant-shared projects
  - user-private projects under tenant billing
  - hybrid mode
- if shared projects are chosen:
  - move project/org uniqueness to `tenant_id`
  - add project membership and permissions
  - add shared release history
  - move filesystem layout away from strictly `userdata/<userId>/...`
- add comments, approval markers, and release status labels
- add drift alerts and scheduled change-watch reporting
- add role-specific dashboards for admins, release managers, and standard users

## Exit Criteria

- collaboration model is explicit and consistent in DB, API, and UI
- shared projects can be safely used by multiple users without ownership confusion
- review and approval workflows are visible in the product
