#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  filter_type: z.string().optional().describe("TENANT_REQUEST, INTERNAL_TASK or WORK_ORDER"),
  filter_dueDate_to: z.string().optional().describe("YYYY-MM-DD; only tasks due on or before this date"),
});
getTool("get_task", "/tasks", "Get one task by id.");

// DoorLoop ignores filters on /files, so read every page and filter here.
async function filesFor(resourceId: string) {
  type File = { id: string; name: string; mimeType?: string; size?: number; linkedResource?: { resourceId: string } };
  const files: File[] = [];
  for (let page = 1; ; page++) {
    const { data, total } = await client.get<{ data: File[]; total: number }>("/files", {
      page_size: 100,
      page_number: page,
    });
    files.push(...data.filter((f) => f.linkedResource?.resourceId === resourceId));
    if (!data.length || page * 100 >= total) return files;
  }
}

listTool("list_users", "/users", "List DoorLoop users on the team, e.g. to pick who a task is assigned to.");

// Vendors who log in to DoorLoop have a user account; vendor-users.json maps vendor id -> user id.
// Matching by email or name isn't reliable (vendors share company emails), so the mapping is explicit.
const VENDOR_USERS_FILE =
  process.env.DOORLOOP_VENDOR_USERS ?? fileURLToPath(new URL("../vendor-users.json", import.meta.url));

function vendorUsers(): Record<string, string> {
  try {
    const map = JSON.parse(readFileSync(VENDOR_USERS_FILE, "utf8")) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(map).filter((e): e is [string, string] => /^[0-9a-f]{24}$/.test(e[0]) && typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}

server.registerTool(
  "list_vendor_users",
  {
    description: "Show which vendors have a DoorLoop login (from vendor-users.json), so tasks can be assigned to them.",
    annotations: { readOnlyHint: true },
  },
  async () => json({ file: VENDOR_USERS_FILE, vendorToUser: vendorUsers() }),
);

// PUT replaces the whole task, so read it, change the assignees and send it all back.
server.registerTool(
  "assign_task",
  {
    description:
      "Assign an existing task to a vendor's DoorLoop login (by vendor id) or to DoorLoop users (replaces the " +
      "current assignees). Without confirm=true this only returns the change it would make, including the " +
      "notification flags, so show that to the user and get their OK first.",
    inputSchema: {
      task: z.string().describe("Task id"),
      vendor: z.string().optional().describe("Vendor id; assigned to that vendor's DoorLoop user from vendor-users.json"),
      users: z.array(z.string()).optional().describe("DoorLoop user ids from list_users, instead of a vendor"),
      notifyAssignees: z.boolean().default(true),
      notifyOwners: z.boolean().default(true),
      notifyTenants: z.boolean().default(true),
      confirm: z.boolean().default(false).describe("Actually assign it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  async ({ task, vendor, users, notifyAssignees, notifyOwners, notifyTenants, confirm }) => {
    let assignees = users ?? [];
    if (vendor) {
      const user = vendorUsers()[vendor];
      if (!user) {
        throw new Error(
          `Vendor ${vendor} has no DoorLoop login in vendor-users.json. Pick a vendor that has one, or pass users.`,
        );
      }
      assignees = [...new Set([...assignees, user])];
    }
    if (!assignees.length) throw new Error("Pass a vendor or at least one user.");

    const current = await client.get<Record<string, unknown>>(`/tasks/${encodeURIComponent(task)}`);
    const flags = { notifyAssignees, notifyOwners, notifyTenants };
    if (!confirm) {
      return json({ preview: true, task, from: current.assignedToUsers ?? [], to: assignees, ...flags });
    }
    return json(await client.put(`/tasks/${encodeURIComponent(task)}`, { ...current, assignedToUsers: assignees, ...flags }));
  },
);

server.registerTool(
  "list_task_children",
  {
    description: "List a task's subtasks and work orders (tasks linked to it as their parent).",
    inputSchema: { task: z.string().describe("Parent task id") },
    annotations: { readOnlyHint: true },
  },
  async ({ task }) =>
    json(
      await client.get("/tasks", {
        filter_linkedResourceId: task,
        filter_linkedResourceType: "TASK",
        page_size: 100,
      }),
    ),
);

server.registerTool(
  "get_task_files",
  {
    description:
      "List the files attached to a task (e.g. photos a tenant uploaded) and return its images so they " +
      "can be looked at. Up to max_images images are returned; other files are listed by name.",
    inputSchema: {
      task: z.string().describe("Task id"),
      max_images: z.number().int().min(0).max(10).default(4),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ task, max_images }) => {
    const files = await filesFor(task);
    const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [
      {
        type: "text",
        text: JSON.stringify(
          files.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
          null,
          2,
        ),
      },
    ];
    for (const f of files.filter((f) => f.mimeType?.startsWith("image/")).slice(0, max_images)) {
      const { data, contentType } = await client.download(`/files/${encodeURIComponent(f.id)}/download`);
      content.push({ type: "image", data: data.toString("base64"), mimeType: contentType.split(";")[0] });
    }
    return { content };
  },
);

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

// DoorLoop has no overdue filter on /leases, so read every page and keep the ones with an overdue balance.
server.registerTool(
  "list_past_due_leases",
  {
    description:
      "Leases with an overdue balance (overdueBalance > 0), largest first, with each lease's property and " +
      "unit names and its tenants' names, emails and phones. Read-only; use it to draft past-due messages.",
    inputSchema: {
      filter_property: z.string().optional().describe("Property id to filter by"),
      min_overdue: z.number().min(0).default(0).describe("Only leases owing more than this"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ filter_property, min_overdue }) => {
    type Lease = {
      id: string;
      name?: string;
      status?: string;
      property?: string;
      units?: string[];
      start?: string;
      end?: string;
      totalBalanceDue?: number;
      overdueBalance?: number;
    };
    const leases: Lease[] = [];
    for (let page = 1; ; page++) {
      const { data, total } = await client.get<{ data: Lease[]; total: number }>("/leases", {
        filter_property,
        page_size: 100,
        page_number: page,
      });
      leases.push(...data.filter((l) => (l.overdueBalance ?? 0) > min_overdue));
      if (!data.length || page * 100 >= total) break;
    }
    leases.sort((a, b) => (b.overdueBalance ?? 0) - (a.overdueBalance ?? 0));

    // Each property and unit is read once, however many leases share it.
    const cache = new Map<string, Promise<Record<string, any> | undefined>>();
    const lookup = (path: string, id?: string) => {
      if (!id) return Promise.resolve(undefined);
      const key = `${path}/${id}`;
      if (!cache.has(key)) cache.set(key, client.get<Record<string, any>>(`${path}/${encodeURIComponent(id)}`).catch(() => undefined));
      return cache.get(key)!;
    };

    const results = [];
    for (const l of leases) {
      const property = await lookup("/properties", l.property);
      const units = await Promise.all((l.units ?? []).map((u) => lookup("/units", u)));
      // Lease records carry no tenant ids, and tenants don't name their lease, so ask /tenants by lease.
      const { data: tenants } = await client
        .get<{ data: Record<string, any>[] }>("/tenants", { filter_lease: l.id, page_size: 100 })
        .catch(() => ({ data: [] as Record<string, any>[] }));
      results.push({
        lease: l.id,
        name: l.name,
        status: l.status,
        start: l.start,
        end: l.end,
        overdueBalance: l.overdueBalance,
        totalBalanceDue: l.totalBalanceDue,
        property: { id: l.property, name: property?.name },
        units: units.map((u, i) => ({ id: l.units![i], name: u?.name })),
        tenants: tenants.map((t) => ({
          id: t.id,
          name: [t.firstName, t.lastName].filter(Boolean).join(" ") || t.name,
          emails: t.emails,
          phones: t.phones,
        })),
      });
    }
    return json({ count: results.length, totalOverdue: results.reduce((s, r) => s + (r.overdueBalance ?? 0), 0), leases: results });
  },
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

type Account = { id: string; name: string; class?: string; defaultAccountFor?: string[] };

// Reads the whole chart of accounts; the API returns at most 100 per page.
async function allAccounts(): Promise<Account[]> {
  const accounts: Account[] = [];
  for (let page = 1; ; page++) {
    const { data, total } = await client.get<{ data: Account[]; total: number }>("/accounts", {
      page_size: 100,
      page_number: page,
    });
    accounts.push(...data);
    if (!data.length || accounts.length >= total) return accounts;
  }
}

// Finds the account DoorLoop marks as the default for a purpose, e.g. RENTAL_INCOME.
async function defaultAccount(purpose: string): Promise<string> {
  const match = (await allAccounts()).find((a) => a.defaultAccountFor?.includes(purpose));
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
      "step. Tenants can be existing tenant ids or new people. Late fees, when on, always follow DoorLoop's " +
      "company late-fee settings; the lease's own late-fee amounts can't be set. Without confirm=true this only returns the " +
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
      automaticLateFees: z
        .boolean()
        .default(false)
        .describe("Charge late fees by DoorLoop's late-fee settings. The lease's own amounts can't be set here."),
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

// Official endpoint: POST /lease-charges (https://api.doorloop.com/reference/post-lease-charge).
server.registerTool(
  "create_lease_charge",
  {
    description:
      "Post a one-time charge on a lease, e.g. a returned-check fee, cleaning fee or repair. Accounts can " +
      "be given by id or by name (e.g. \"Cleaning Fee\"). Without confirm=true this only returns the " +
      "request it would send, with account names and the total, so show that to the user and get their " +
      "OK before confirming.",
    inputSchema: {
      lease: z.string().describe("Lease id"),
      date: date.optional().describe("YYYY-MM-DD charge date. Defaults to today."),
      memo: z.string().max(1000).optional(),
      lines: z
        .array(
          z.object({
            account: z.string().describe("Account id, or its exact name from list_accounts"),
            amount: z.number().positive(),
            memo: z.string().max(1000).optional(),
          }),
        )
        .min(1),
      confirm: z.boolean().default(false).describe("Actually post it. Leave false to preview."),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  async ({ lease, date: chargeDate, memo, lines, confirm }) => {
    const accounts = await allAccounts();
    const resolved = lines.map((line) => {
      const key = line.account.trim().toLowerCase();
      const matches = accounts.filter((a) => a.id === line.account || a.name.trim().toLowerCase() === key);
      if (matches.length !== 1) {
        throw new Error(
          `${matches.length ? "Several" : "No"} accounts match "${line.account}"; pass the account id from list_accounts.`,
        );
      }
      return { ...line, account: matches[0].id, accountName: matches[0].name, accountClass: matches[0].class };
    });

    const body = {
      lease,
      date: chargeDate ?? new Date().toLocaleDateString("en-CA"),
      ...(memo && { memo }),
      lines: resolved.map(({ account, amount, memo }) => ({ account, amount, ...(memo && { memo }) })),
    };

    if (!confirm) {
      return json({
        preview: true,
        total: resolved.reduce((sum, l) => sum + l.amount, 0),
        accounts: resolved.map(({ accountName, accountClass, amount }) => ({ accountName, accountClass, amount })),
        request: body,
      });
    }
    return json(await client.post("/lease-charges", body));
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
