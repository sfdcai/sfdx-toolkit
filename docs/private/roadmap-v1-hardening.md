# Roadmap — V1 Hardening

Focus: production reliability, operator trust, and release safety.

## Goals

- make the current product safe to run repeatedly
- reduce data drift and invalid state
- improve production readiness for self-hosted use

## Work Items

- finish HTTPS verification for `sfdx.duckdns.org`
- add app health check script in addition to data integrity checks
- add comparison/diff metering to match subscription behavior
- add success banners for manifest generation, retrieve, compare, and deploy
- add clearer runtime diagnostics for Caddy, Salesforce CLI, disk space, and PM2
- add backup/restore script with validation output
- add protected production-mode config checks at startup

## Exit Criteria

- integrity checks run clean on schedule
- app health checks pass
- HTTPS works externally with a valid cert
- release checklist can be completed without manual database intervention
