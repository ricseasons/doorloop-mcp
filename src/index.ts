#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomBytes } from "node:crypto";
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

listTool("list_tasks", "/tasks", "List tasks (maintenance requests, to-dos, work orders).", {
  filter_status: z.string().optional().describe("Task status to filter by, e.g. NOT_STARTED, IN_PROGRESS"),
  filter_property: z.string().optional().describe("Property id to filter by"),
});
getTool("get_task", "/tasks", "Get one task by id.");

listTool("list_vendors", "/vendors", "List vendors, e.g. to find one suited to a maintenance task.", {
  filter_text: z.string().optional().describe("Free-text search on vendor name or details"),
});
getTool("get_vendor", "/vendors", "Get one vendor by id.");

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

// Mirrors the web app's new task / new subtask form (captured 2026-10-22). Undocumented.
server.registerTool(
  "create_task",
  {
    description:
      "Create an internal task, or a subtask when parentTask is given. Without confirm=true this " +
      "only returns the request it would send, so show that to the user and get their OK first.",
    inputSchema: {
      subject: z.string(),
      description: z.string().optional(),
      parentTask: z.string().optional().describe("Id of the parent task, to create this as its subtask"),
      priority: z.string().default("MEDIUM").describe("e.g. LOW, MEDIUM, HIGH"),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
      assignedToUsers: z
        .array(z.string())
        .optional()
        .describe("DoorLoop user ids to assign. Defaults to the API key's user."),
      notifyAssignees: z.boolean().default(true),
      confirm: z.boolean().default(false).describe("Actually create it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ parentTask, assignedToUsers, confirm, ...rest }) => {
    const body: Record<string, unknown> = {
      type: "INTERNAL_TASK",
      dateType: "DATE",
      reference: randomBytes(3).toString("hex"),
      status: "NOT_STARTED",
      ...(parentTask && { linkedResource: { resourceId: parentTask, resourceType: "TASK" } }),
      ...rest,
    };

    if (!confirm) {
      return json({ preview: true, note: "requestedByUser is filled in from the API key on confirm", request: body });
    }
    const me = await client.get<{ id: string }>("/users/me");
    body.requestedByUser = me.id;
    body.assignedToUsers = assignedToUsers ?? [me.id];
    return json(await client.post("/tasks/", body));
  },
);

// Mirrors the web app's "New work order" form on a task (captured 2026-10-22). Undocumented.
server.registerTool(
  "create_work_order",
  {
    description:
      "Create a work order for a vendor, linked to an existing task as its subtask. Without " +
      "confirm=true this only returns the request it would send, so show that to the user and get " +
      "their OK before confirming. With notifyVendor, DoorLoop emails the vendor on creation.",
    inputSchema: {
      task: z.string().describe("Id of the task this work order belongs to"),
      vendor: z.string().describe("Vendor id to assign"),
      subject: z.string(),
      description: z.string().optional(),
      priority: z.string().default("MEDIUM").describe("e.g. LOW, MEDIUM, HIGH"),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
      entryPermission: z.string().default("YES").describe("Whether the vendor may enter, e.g. YES or NO"),
      approvedByOwner: z.boolean().default(true),
      assignedToUsers: z
        .array(z.string())
        .optional()
        .describe("DoorLoop user ids to assign. Defaults to the API key's user."),
      notifyVendor: z.boolean().default(true),
      notifyOwners: z.boolean().default(true),
      notifyTenants: z.boolean().default(false),
      notifyAssignees: z.boolean().default(false),
      confirm: z.boolean().default(false).describe("Actually create it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ task, vendor, approvedByOwner, assignedToUsers, confirm, ...rest }) => {
    const body: Record<string, unknown> = {
      reference: randomBytes(3).toString("hex"),
      dateType: "DATE",
      status: "NOT_STARTED",
      type: "WORK_ORDER",
      workOrder: { assignedToVendor: vendor, approvedByOwner },
      linkedResource: { resourceId: task, resourceType: "TASK" },
      ...rest,
    };

    if (!confirm) {
      return json({ preview: true, note: "requestedByUser is filled in from the API key on confirm", request: body });
    }
    const me = await client.get<{ id: string }>("/users/me");
    body.requestedByUser = me.id;
    body.assignedToUsers = assignedToUsers ?? [me.id];
    return json(await client.post("/tasks/", body));
  },
);

listTool("list_accounts", "/accounts", "List chart-of-accounts entries, e.g. to pick the account for a lease charge.");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const frequency = z
  .enum(["Daily", "Weekly", "Every2Weeks", "Monthly", "Every2Months", "Quarterly", "Every6Months", "Annually"])
  .default("Monthly");

type Account = { id: string; defaultAccountFor?: string[] };

// Finds the account DoorLoop marks as the default for a purpose, e.g. RENTAL_INCOME.
async function defaultAccount(purpose: string): Promise<string> {
  const { data } = await client.get<{ data: Account[] }>("/accounts", { page_size: 200 });
  const match = data.find((a) => a.defaultAccountFor?.includes(purpose));
  if (!match) throw new Error(`No default ${purpose} account in DoorLoop; pass the account id explicitly.`);
  return match.id;
}

// Official endpoint: POST /leases/full creates the lease, any new tenants, rent, deposits and charges in
// one transaction (https://api.doorloop.com/reference/post-leases-full).
server.registerTool(
  "create_lease",
  {
    description:
      "Create a lease with its tenants, monthly rent, security deposit and other recurring charges in one " +
      "step. Tenants can be existing tenant ids or new people. Without confirm=true this only returns the " +
      "request it would send, so show that to the user and get their OK before confirming.",
    inputSchema: {
      property: z.string().describe("Property id"),
      units: z.array(z.string()).min(1).describe("Unit ids on that property"),
      term: z.enum(["Fixed", "AtWill"]),
      start: date,
      end: date.optional().describe("YYYY-MM-DD. Required for a Fixed term."),
      rolloverToAtWill: z.boolean().optional().describe("Go month-to-month when the fixed term ends"),
      tenants: z
        .array(
          z.union([
            z.string().describe("Existing tenant id"),
            z.object({
              firstName: z.string(),
              lastName: z.string(),
              email: z.string().optional(),
              phone: z.string().optional(),
            }),
          ]),
        )
        .min(1),
      rent: z
        .object({
          amount: z.number().positive(),
          frequency,
          start: date.optional().describe("First rent due date; sets the due day. Defaults to the lease start."),
          account: z.string().optional().describe("Defaults to the account DoorLoop uses for rental income"),
        })
        .optional(),
      securityDeposit: z
        .object({
          amount: z.number().positive(),
          date: date.optional().describe("Defaults to the lease start"),
          account: z.string().optional().describe("Defaults to DoorLoop's security deposit account"),
        })
        .optional(),
      recurringCharges: z
        .array(
          z.object({
            account: z.string().describe("Account id from list_accounts, e.g. Parking or Pet Fees"),
            amount: z.number().positive(),
            frequency,
            start: date,
            end: date.optional(),
            memo: z.string().optional(),
          }),
        )
        .optional(),
      residentPortalAccess: z.boolean().default(false).describe("Invite tenants to the resident portal"),
      sendWelcomeSms: z.boolean().default(false),
      automaticLateFees: z.boolean().default(false),
      confirm: z.boolean().default(false).describe("Actually create it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ rent, securityDeposit, recurringCharges, confirm, ...lease }) => {
    if (lease.term === "Fixed" && !lease.end) throw new Error("A Fixed lease needs an end date.");

    const body: Record<string, unknown> = {
      ...lease,
      ...(rent && {
        rent: {
          frequency: rent.frequency,
          ...(rent.start && { start: rent.start }),
          lines: [{ account: rent.account ?? (await defaultAccount("RENTAL_INCOME")), amount: rent.amount }],
        },
      }),
      ...(securityDeposit && {
        securityDeposits: [
          {
            date: securityDeposit.date ?? lease.start,
            lines: [
              {
                account: securityDeposit.account ?? (await defaultAccount("SECURITY_DEPOSIT")),
                amount: securityDeposit.amount,
              },
            ],
          },
        ],
      }),
      ...(recurringCharges?.length && {
        recurringCharges: recurringCharges.map(({ account, amount, memo, ...schedule }) => ({
          ...schedule,
          lines: [{ account, amount, ...(memo && { memo }) }],
        })),
      }),
    };

    if (!confirm) return json({ preview: true, request: body });
    return json(await client.post("/leases/full", body));
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
