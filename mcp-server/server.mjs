import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const APP_TOKEN = process.env.APP_TOKEN || "";

function withSlashlessBase(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function callApi(path, options = {}) {
  const base = withSlashlessBase(APP_BASE_URL);
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (APP_TOKEN) headers.set("Authorization", `Bearer ${APP_TOKEN}`);
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function asText(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}

const mcp = new McpServer({
  name: "sfdx-toolkit-mcp",
  version: "0.1.0"
});

mcp.registerTool(
  "services_status",
  {
    description: "Read app/service health status from the SFDX toolkit.",
    inputSchema: {}
  },
  async () => {
    const data = await callApi("/api/services/status", { method: "GET" });
    return asText(data);
  }
);

mcp.registerTool(
  "manifest_validate",
  {
    description: "Validate and normalize a Salesforce package XML for a project.",
    inputSchema: {
      projectId: z.string().min(1).describe("Project id"),
      xml: z.string().min(1).describe("Raw package.xml content")
    }
  },
  async ({ projectId, xml }) => {
    const data = await callApi(`/api/projects/${encodeURIComponent(projectId)}/manifests/validate`, {
      method: "POST",
      body: JSON.stringify({ xml })
    });
    return asText(data);
  }
);

mcp.registerTool(
  "delta_generate",
  {
    description: "Generate delta manifest/destructiveChanges from selected compare changes.",
    inputSchema: {
      projectId: z.string().min(1).describe("Project id"),
      changes: z
        .array(
          z.object({
            type: z.string(),
            name: z.string(),
            status: z.string(),
            relPath: z.string().optional()
          })
        )
        .min(1)
        .describe("Selected diff changes")
    }
  },
  async ({ projectId, changes }) => {
    const data = await callApi(`/api/projects/${encodeURIComponent(projectId)}/delta`, {
      method: "POST",
      body: JSON.stringify({ changes })
    });
    return asText(data);
  }
);

mcp.registerTool(
  "deploy_start",
  {
    description: "Start deployment for a project delta manifest.",
    inputSchema: {
      projectId: z.string().min(1).describe("Project id"),
      testLevel: z.enum(["NoTestRun", "RunLocalTests", "RunSpecifiedTests", "RunAllTestsInOrg"]).optional(),
      tests: z.array(z.string()).optional(),
      checkOnly: z.boolean().optional(),
      ignoreWarnings: z.boolean().optional(),
      ignoreErrors: z.boolean().optional(),
      dryRun: z.boolean().optional()
    }
  },
  async ({ projectId, ...payload }) => {
    const data = await callApi(`/api/projects/${encodeURIComponent(projectId)}/deploy`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return asText(data);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
