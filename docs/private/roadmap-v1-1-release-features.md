# Roadmap — V1.1 Release Features

Focus: making releases repeatable, reviewable, and easier to trust.

## Goals

- turn one-off compare/deploy runs into reusable release artifacts
- reduce failed deployments caused by dependency surprises

## Work Items

- release snapshots and named release packs
- save selected diff rows as a reusable release candidate
- preserve manifest, report, org context, and deploy settings in history
- add dependency/risk analysis before deploy
- add layout and permission-set advisory warnings
- add deploy risk badges for destructive changes, flows, Apex, layouts, and permissions
- add release notes/export bundle from report and delta selection

## Exit Criteria

- users can reopen a saved release pack and redeploy from it
- deploy screen warns about common metadata risk patterns before execution
- report/history screens become useful for release review, not only troubleshooting
