# MCP Adapter Setup

## What was added

- Thin MCP server adapter at `mcp-server/server.mjs`
- NPM script: `npm run mcp:start`
- Tools exposed:
  - `services_status`
  - `manifest_validate`
  - `delta_generate`
  - `deploy_start`

The adapter calls the existing app APIs. No Salesforce business logic is duplicated.

## Required environment variables

- `APP_BASE_URL` (default: `http://127.0.0.1:3000`)
- `APP_TOKEN` (JWT bearer token for app API auth)

## Run

```bash
APP_BASE_URL=http://127.0.0.1:3000 APP_TOKEN=<jwt> npm run mcp:start
```

## Example MCP client config (stdio)

```json
{
  "mcpServers": {
    "sfdx-toolkit": {
      "command": "npm",
      "args": ["run", "mcp:start"],
      "env": {
        "APP_BASE_URL": "http://127.0.0.1:3000",
        "APP_TOKEN": "<jwt>"
      }
    }
  }
}
```

## Security note

- Prefer short-lived API tokens.
- Do not hardcode PAT/JWT in files.
- For Git push authentication on servers, deploy keys are usually safer than broad PATs because they can be scoped to one repository.
