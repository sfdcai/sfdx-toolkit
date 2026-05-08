# Frontend Recovery + MCP Plan (2026-05-08)

## Incident Summary

- Symptom: `https://sfdx.duckdns.org/` was down.
- Root cause 1: Next.js app under PM2 restarted repeatedly because production build artifacts were missing/incomplete in `.next` (`prerender-manifest.json` not found).
- Root cause 2: Caddy failed to start TLS due to permission errors reading certificate files:
  - `open /var/lib/caddy/.local/share/caddy/certificates/.../sfdx.duckdns.org.key: permission denied`

## Recovery Actions Taken

1. Rebuilt frontend production artifacts:
   - `npm run build`
2. Reloaded PM2 app:
   - `npx pm2 reload sfdx-devops`
3. Fixed Caddy TLS storage ownership/permissions:
   - `chown -R caddy:caddy /var/lib/caddy/.local`
   - `chown root:caddy /var/lib/caddy`
   - `chmod 750 /var/lib/caddy`
4. Started Caddy:
   - `systemctl start caddy`

## Verification

- PM2 app online:
  - `npx pm2 status` shows `sfdx-devops` as `online`.
- Local app status OK:
  - `curl -sS http://127.0.0.1:3000/api/services/status`
- Public app status OK:
  - `curl -sS https://sfdx.duckdns.org/api/services/status`
- Caddy running:
  - `systemctl status caddy --no-pager`

## Notes For Next API Work

- New manifest validation endpoint is available:
  - `POST /api/projects/:id/manifests/validate`
- Use flow for delta manifest creation:
  1. Send raw manifest XML to `/api/projects/:id/manifests/validate`.
  2. Use returned normalized `xml` as canonical deploy manifest input.
  3. Feed selected compare changes to `/api/projects/:id/delta`.
  4. Deploy using `/api/projects/:id/deploy`.

## MCP Server Feasibility

Yes, this app can be exposed as an MCP server for AI agents. Recommended approach:

1. Create a thin Node MCP server in `mcp-server/`.
2. Register tools that call existing HTTP API routes:
   - `projects.list`, `projects.get`
   - `manifest.validate`
   - `delta.generate`
   - `deploy.start`, `deploy.status`
3. Add resource endpoints for docs and project metadata:
   - `docs://api`, `docs://architecture`
   - `project://{id}/manifests`
4. Use service token auth for MCP -> app API calls.
5. Restrict tools by tenant/user scope and audit each call.

This keeps business logic in current Next.js APIs and gives AI a stable, typed interface.
