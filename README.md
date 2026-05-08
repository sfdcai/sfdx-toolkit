# SFDX DevOps Platform (Next.js)

A clean rebuild of the SFDX DevOps Web Platform using Next.js 14, TypeScript, and Tailwind. This codebase focuses on a synchronous CLI workflow (no job queue) with a strong UI/UX and clear documentation.

## Quick Start

```bash
npm install
npm run dev
```

## Documentation

- `docs/overview.md`
- `docs/architecture.md`
- `docs/features.md`
- `docs/flows.md`
- `docs/api.md`
- `docs/security.md`
- `docs/ui.md`
- `docs/setup.md`
- `docs/lessons.md`

## Notes

- Salesforce CLI binary is resolved using `SF_CLI_PATH` (default: `/root/cli/sf/bin/sf`).
- All user data is scoped to `userdata/<userId>`.
