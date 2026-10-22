#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
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

// Placeholder property id the web app sends before the property exists.
const NEW_PROPERTY_PLACEHOLDER = "507f1f77bcf86cd799439011";

// The public API has no way to create units, so this mirrors the request the
// DoorLoop web app's "New property" wizard sends (captured 2026-10-22).
// Undocumented: it may change without notice.
server.registerTool(
  "create_property_with_units",
  {
    description:
      "Create a property and its units in one step. Without confirm=true this only returns the " +
      "request it would send, so show that to the user and get their OK before confirming.",
    inputSchema: {
      street1: z.string(),
      street2: z.string().optional(),
      city: z.string(),
      state: z.string().describe("Two-letter state code"),
      zip: z.string(),
      country: z.string().default("United States"),
      type: z
        .string()
        .default("RESIDENTIAL_MULTI_FAMILY")
        .describe("DoorLoop property type; RESIDENTIAL_MULTI_FAMILY is the only value confirmed so far"),
      units: z
        .array(
          z.object({
            name: z.string().describe('Unit name, e.g. "Apt 1"'),
            beds: z.number().optional(),
            baths: z.number().optional(),
            size: z.number().optional().describe("Square feet"),
            marketRent: z.number().optional().describe("Listing / market rent per month"),
          }),
        )
        .min(1),
      confirm: z.boolean().default(false).describe("Actually create it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ street1, street2, city, state, zip, country, type, units, confirm }) => {
    const body = {
      property: {
        active: true,
        address: {
          street1,
          ...(street2 && { street2 }),
          city,
          state,
          zip,
          country,
          shouldValidateStateAndCountry: true,
          acceptInvalidAddress: true,
        },
        numActiveUnits: 0,
        type,
        owners: [],
      },
      units: units.map((u) => ({
        active: true,
        addressSameAsProperty: true,
        rentalApplicationListing: { activeListing: true },
        id: randomUUID(),
        property: NEW_PROPERTY_PLACEHOLDER,
        ...u,
      })),
      specifyAccounts: "default",
      specifySecurityDeposit: "",
      reserveFundsEnabled: "DISABLED",
      invalidUnitsName: false,
      propertyOwnershipEnabled: "DISABLED",
    };

    if (!confirm) return json({ preview: true, request: body });
    return json(await client.post("/properties/create-property-wizard/", body));
  },
);

// Mirrors the web app's "Add new unit" form (captured 2026-10-22). Undocumented.
server.registerTool(
  "create_unit",
  {
    description:
      "Add a unit to an existing property. Without confirm=true this only returns the request it " +
      "would send, so show that to the user and get their OK before confirming.",
    inputSchema: {
      property: z.string().describe("Property id"),
      name: z.string().describe('Unit name, e.g. "Unit 3"'),
      beds: z.number().optional(),
      baths: z.number().optional(),
      size: z.number().optional().describe("Square feet"),
      marketRent: z.number().optional().describe("Listing / market rent per month"),
      description: z.string().max(1000).optional(),
      address: z
        .object({
          street1: z.string(),
          street2: z.string().optional(),
          city: z.string(),
          state: z.string().describe("Two-letter state code"),
          zip: z.string(),
          country: z.string().default("United States"),
        })
        .optional()
        .describe("Only when the unit's address differs from the property's"),
      confirm: z.boolean().default(false).describe("Actually create it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ confirm, address, ...unit }) => {
    const body = {
      active: true,
      addressSameAsProperty: !address,
      rentalApplicationListing: { activeListing: true },
      pictures: [],
      listing: { leaseTermsActive: false },
      amenities: [],
      disablePersonDetailsValidation: false,
      ...unit,
      ...(address && { address: { shouldValidateStateAndCountry: true, ...address } }),
    };

    if (!confirm) return json({ preview: true, request: body });
    return json(await client.post("/units/", body));
  },
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
