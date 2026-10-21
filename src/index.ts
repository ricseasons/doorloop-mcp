#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadApiKey } from "./auth.js";
import { DoorLoopClient, type Query } from "./client.js";

const client = new DoorLoopClient(loadApiKey());

const server = new McpServer({ name: "doorloop", version: "0.1.0" });

const paging = {
  page_number: z.number().int().min(1).optional().describe("Page to return, starting at 1"),
  page_size: z.number().int().min(1).max(100).optional().describe("Results per page (max 100)"),
};

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// Registers a read-only list tool over a DoorLoop collection endpoint.
function listTool(name: string, path: string, description: string, filters: z.ZodRawShape = {}) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: { ...filters, ...paging },
      annotations: { readOnlyHint: true },
    },
    async (args) => json(await client.get(path, args as Query)),
  );
}

// Registers a read-only "get one by id" tool.
function getTool(name: string, path: string, description: string) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: { id: z.string().describe("DoorLoop record id") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => json(await client.get(`${path}/${encodeURIComponent(id)}`)),
  );
}

server.registerTool(
  "whoami",
  {
    description: "Show the DoorLoop user that owns the API key. Use to check the connection works.",
    annotations: { readOnlyHint: true },
  },
  async () => json(await client.get("/users/me")),
);

listTool("list_properties", "/properties", "List properties in the DoorLoop account.");
getTool("get_property", "/properties", "Get one property by id.");

listTool("list_units", "/units", "List units, optionally filtered to one property.", {
  filter_property: z.string().optional().describe("Property id to filter by"),
});
getTool("get_unit", "/units", "Get one unit by id.");

listTool("list_tenants", "/tenants", "List tenants.", {
  filter_text: z.string().optional().describe("Free-text search on tenant name, email or phone"),
});
getTool("get_tenant", "/tenants", "Get one tenant by id.");

listTool("list_leases", "/leases", "List leases, optionally filtered to a property or unit.", {
  filter_property: z.string().optional().describe("Property id to filter by"),
  filter_unit: z.string().optional().describe("Unit id to filter by"),
});
getTool("get_lease", "/leases", "Get one lease by id.");

server.registerTool(
  "get_rent_roll",
  {
    description: "Rent roll report: each unit with its lease, rent and balance. Useful for finding past-due tenants.",
    inputSchema: {
      filter_property: z.string().optional().describe("Property id to filter by"),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => json(await client.get("/reports/rent-roll", args as Query)),
);

// Escape hatch while we map the API: any GET against a DoorLoop path.
server.registerTool(
  "doorloop_get",
  {
    description:
      "Read-only GET against any DoorLoop API path (e.g. /lease-tenants, /lease-charges). " +
      "Use when no dedicated tool exists yet.",
    inputSchema: {
      path: z.string().regex(/^\/[A-Za-z0-9\-_/]*$/).describe("API path starting with /"),
      query: z.record(z.string(), z.string()).optional().describe("Query string parameters"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ path, query }) => json(await client.get(path, query)),
);

await server.connect(new StdioServerTransport());
