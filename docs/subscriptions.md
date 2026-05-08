# SFDX DevOps Platform — Subscription Plan & SaaS Roadmap

This document captures the subscription model, usage limits, and the multi‑tenant migration plan. It also includes the latest backup details.

---

## 1. Latest Backup

A full backup was created before starting subscription work.

- Archive: `/root/sfdx-toolkit-backup-20251220-233922.tar.gz`
- Command used:

```
tar -czf /root/sfdx-toolkit-backup-YYYYMMDD-HHMMSS.tar.gz /root/sfdx-toolkit-0.0.1
```

Restore:

```
tar -xzf /root/sfdx-toolkit-backup-YYYYMMDD-HHMMSS.tar.gz -C /root
```

---

## 2. Subscription Plans (Proposed)

### Free (Primary Acquisition)

- Projects: 1
- Orgs: 2 (1 source + 1 destination)
- Storage: 2 GB
- Monthly runs: 30 retrieve, 30 diff, 10 deploy
- History retention: 7 days
- Advanced retry: No
- Admin tools: No
- Support: Community

### Pro (Teams)

- Projects: 20
- Orgs: 10
- Storage: 50 GB
- Monthly runs: 300 retrieve, 300 diff, 100 deploy
- History retention: 90 days
- Advanced retry: Yes
- Admin tools: Yes
- Support: Priority email

### Enterprise

- Projects: Unlimited
- Orgs: Unlimited
- Storage: 500 GB+ (custom)
- Monthly runs: Unlimited (fair‑use)
- History retention: 365 days
- Advanced retry: Yes + configurable policies
- Admin tools: Yes + audit logs + RBAC
- Support: SLA + onboarding

---

## 3. Metering & Limits

Usage metrics to track per tenant:

- Total storage in bytes
- Retrieve runs per month
- Diff runs per month
- Deploy runs per month
- Total projects
- Total orgs
- Total users

Enforcement points:

- Project creation: enforce project count
- Org addition: enforce org count
- Retrieve / Diff / Deploy: enforce run count
- Background storage check: enforce storage cap
- Upgrade requests: manual approval by super admin

---

## 4. Multi‑Tenant Migration (DB Plan)

### Tables to Add

- `tenants`
- `subscriptions`
- `usage_metrics`
- `audit_logs` (Enterprise)

### Columns to Add

- Add `tenant_id` to: users, projects, orgs, retrievals, comparisons, deployments

### Example Tables

**tenants**

- id, name, plan, status, created_at

**subscriptions**

- id, tenant_id, plan, status
- period_start, period_end
- stripe_customer_id, stripe_subscription_id

**usage_metrics**

- id, tenant_id
- period_start, period_end
- retrieves, diffs, deploys, storage_bytes

---

## 5. API Changes (Planned)

- Add tenant scoping to every query
- Enforce plan limits in key endpoints
- New endpoints:
  - `GET /api/tenant/usage`
  - `GET /api/tenant/subscription`
  - `POST /api/tenant/upgrade`

---

## 6. Billing Integration (Future)

Recommended provider: Stripe

- Store `stripe_customer_id` and `stripe_subscription_id`
- Use webhook events to update subscription status

---

## 7. UI Additions (Planned)

- Plan status pill in top bar
- Usage meter dashboard
- Upgrade prompts when limits reached
- Upgrade request review in super admin console
