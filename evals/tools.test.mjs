// Tool evals: call each MCP tool against the fake DoorLoop and check what it sent and what it returned.
// Deterministic and free (no Claude calls). Run with `npm run eval:tools`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { startMock } from "./mock/server.mjs";
import { IDS } from "./mock/world.mjs";
import { SERVER, serverEnv } from "./lib/server-env.mjs";

let mock;
let client;

before(async () => {
  mock = await startMock();
  const dir = mkdtempSync(join(tmpdir(), "doorloop-tools-"));
  client = new Client({ name: "doorloop-evals", version: "0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH, ...serverEnv(mock.url, dir) } }),
  );
});

after(async () => {
  await client?.close();
  await mock?.close();
});

beforeEach(() => (mock.log.length = 0));

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content.find((c) => c.type === "text")?.text ?? "";
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ...res, data, text };
}

const writes = () => mock.writes();

describe("tool list", () => {
  test("every write tool previews unless confirm is true", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const t of ["list_past_due_leases", "create_lease", "create_lease_charge", "assign_task", "create_task", "create_work_order"]) {
      assert.ok(names.includes(t), `${t} is listed`);
    }
    for (const t of tools.filter((t) => !t.annotations?.readOnlyHint)) {
      assert.equal(t.inputSchema.properties.confirm?.default, false, `${t.name} defaults confirm to false`);
    }
  });

  test("the server sends the API key as a bearer token", async () => {
    await call("whoami");
    assert.equal(mock.log[0].authorized, true);
  });
});

describe("create_lease", () => {
  const args = {
    property: IDS.property.reservation,
    units: [IDS.unit.apt2],
    term: "Fixed",
    start: "2026-11-01",
    end: "2027-10-31",
    rolloverToAtWill: true,
    tenants: [{ firstName: "API Test", lastName: "Tenant", email: "api.test.tenant@example.com" }],
    rent: { amount: 1300, frequency: "Monthly", start: "2026-11-01" },
    securityDeposit: { amount: 1300 },
    automaticLateFees: true,
  };

  test("preview sends nothing and finds the default accounts on page 2", async () => {
    const { data } = await call("create_lease", args);
    assert.equal(data.preview, true);
    assert.deepEqual(writes(), []);
    assert.equal(data.request.rent.lines[0].account, IDS.account.rent);
    assert.equal(data.request.securityDeposits[0].lines[0].account, IDS.account.deposit);
    assert.equal(data.request.securityDeposits[0].date, "2026-11-01");
    assert.equal(data.request.automaticLateFees, true);
    assert.equal(data.request.residentPortalAccess, false);
    assert.equal(data.request.sendWelcomeSms, false);
  });

  test("confirm posts one /leases/full with the previewed body", async () => {
    const preview = (await call("create_lease", args)).data.request;
    const res = await call("create_lease", { ...args, confirm: true });
    assert.ok(!res.isError, res.text);
    const posts = writes();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, "/leases/full");
    assert.deepEqual(posts[0].body, preview);
    assert.ok(mock.world.tenants.some((t) => t.email === "api.test.tenant@example.com"));
  });

  test("a fixed lease without an end date is refused before any request", async () => {
    const res = await call("create_lease", { ...args, end: undefined, confirm: true });
    assert.equal(res.isError, true);
    assert.match(res.text, /end date/);
    assert.deepEqual(writes(), []);
  });
});

describe("create_lease_charge", () => {
  test("resolves an account by its exact name and previews the total", async () => {
    const { data } = await call("create_lease_charge", {
      lease: IDS.lease.maria,
      lines: [{ account: "late fees", amount: 25 }, { account: "Cleaning Fee", amount: 200 }],
    });
    assert.equal(data.preview, true);
    assert.equal(data.total, 225);
    assert.deepEqual(data.accounts.map((a) => a.accountName), ["Late Fees", "Cleaning Fee"]);
    assert.deepEqual(writes(), []);
  });

  test("matches account names loosely: case, plurals and partial words", async () => {
    const { data } = await call("create_lease_charge", {
      lease: IDS.lease.maria,
      lines: [{ account: "Late Fee", amount: 25 }, { account: "cleaning", amount: 200 }, { account: "pet-fee", amount: 50 }],
    });
    assert.deepEqual(data.accounts.map((a) => a.accountName), ["Late Fees", "Cleaning Fee", "Pet Fees"]);
    assert.deepEqual(data.request.lines.map((l) => l.account), [IDS.account.lateFees, "ac00000000000000000c0001", "6e3711c00afea8cc87496907"]);
    assert.deepEqual(writes(), []);
  });

  test("several matching accounts are listed for the user to pick, not guessed", async () => {
    const res = await call("create_lease_charge", { lease: IDS.lease.maria, lines: [{ account: "pet", amount: 25 }], confirm: true });
    assert.equal(res.isError, true);
    assert.match(res.text, /2 accounts match "pet"/);
    assert.match(res.text, /Pet Fees \(REVENUE/);
    assert.match(res.text, /Pet Deposit \(LIABILITY/);
    assert.match(res.text, /Ask the user which one/);
    assert.deepEqual(writes(), []);
  });

  test("an unknown account name is refused", async () => {
    const res = await call("create_lease_charge", { lease: IDS.lease.maria, lines: [{ account: "Lawn care", amount: 25 }], confirm: true });
    assert.equal(res.isError, true);
    assert.match(res.text, /No accounts match "Lawn care"/);
    assert.deepEqual(writes(), []);
  });
});

describe("list_accounts", () => {
  test("searches by name loosely and returns short rows", async () => {
    const { data } = await call("list_accounts", { name: "late fee" });
    assert.equal(data.total, 1);
    assert.deepEqual(data.data, [{ id: IDS.account.lateFees, name: "Late Fees", class: "REVENUE", active: true }]);
  });

  test("filters by class and skips inactive accounts unless asked", async () => {
    const revenue = (await call("list_accounts", { class: "revenue" })).data;
    assert.deepEqual(revenue.data.map((a) => a.name), ["Late Fees", "Pet Fees", "Parking", "Cleaning Fee", "Rent Income"]);
    const all = (await call("list_accounts", { class: "REVENUE", name: "late", include_inactive: true })).data;
    assert.deepEqual(all.data.map((a) => a.name), ["Late Fees", "Late Fee (old)"]);
  });

  test("reads every page so accounts past the first 100 are found", async () => {
    const { data } = await call("list_accounts", { name: "Rent Income" });
    assert.deepEqual(data.data[0].defaultAccountFor, ["RENTAL_INCOME"]);
  });
});

describe("list_past_due_leases", () => {
  test("lists overdue leases largest first with their tenants and contacts", async () => {
    const { data } = await call("list_past_due_leases");
    assert.deepEqual(
      data.leases.map((l) => l.lease),
      [IDS.lease.devon, IDS.lease.kims, IDS.lease.noContact, IDS.lease.maria, IDS.lease.ended, IDS.lease.rosa],
    );
    assert.equal(data.totalOverdue, 2750.5 + 1200 + 1000 + 850 + 410.25 + 35);
    const kims = data.leases.find((l) => l.lease === IDS.lease.kims);
    assert.deepEqual(kims.tenants.map((t) => t.name), ["Sam Kim", "Alex Kim"]);
    assert.equal(kims.property.name, "12 Elm Court");
    assert.equal(kims.units[0].name, "Unit B");
    assert.deepEqual(writes(), []);
  });

  test("filters to one property and a minimum balance", async () => {
    const { data } = await call("list_past_due_leases", { filter_property: IDS.property.reservation, min_overdue: 100 });
    assert.deepEqual(data.leases.map((l) => l.lease), [IDS.lease.maria]);
  });
});

describe("assign_task", () => {
  test("a vendor without a DoorLoop login is refused", async () => {
    const res = await call("assign_task", { task: IDS.task.pest, vendor: IDS.vendor.actionPest, confirm: true });
    assert.equal(res.isError, true);
    assert.match(res.text, /no DoorLoop login/);
    assert.deepEqual(writes(), []);
  });

  test("preview shows the change and notifications without writing", async () => {
    const { data } = await call("assign_task", { task: IDS.task.leak, vendor: IDS.vendor.reliable });
    assert.deepEqual(data, {
      preview: true,
      task: IDS.task.leak,
      from: [],
      to: [IDS.user.reliableLogin],
      notifyAssignees: true,
      notifyOwners: true,
      notifyTenants: true,
    });
    assert.deepEqual(writes(), []);
  });

  test("confirm PUTs the whole task with the vendor's login", async () => {
    const before = structuredClone(mock.world.tasks.find((t) => t.id === IDS.task.leak));
    await call("assign_task", { task: IDS.task.leak, vendor: IDS.vendor.reliable, notifyTenants: false, confirm: true });
    const [put] = writes();
    assert.equal(put.method, "PUT");
    assert.equal(put.path, `/tasks/${IDS.task.leak}`);
    assert.deepEqual(put.body, { ...before, assignedToUsers: [IDS.user.reliableLogin], notifyAssignees: true, notifyOwners: true, notifyTenants: false });
  });
});

describe("tasks", () => {
  test("create_task and create_work_order only preview without confirm", async () => {
    const a = await call("create_task", { subject: "x", parentTask: IDS.task.pest });
    const b = await call("create_work_order", { task: IDS.task.pest, vendor: IDS.vendor.capitalPest, subject: "x" });
    assert.equal(a.data.preview, true);
    assert.equal(b.data.preview, true);
    assert.equal(b.data.request.type, "WORK_ORDER");
    assert.deepEqual(writes(), []);
  });

  test("list_task_children finds a task's work orders", async () => {
    const { data } = await call("list_task_children", { task: IDS.task.hotWater });
    assert.deepEqual(data.data.map((t) => t.id), [IDS.task.hotWaterWO]);
  });

  test("get_task_files returns the task's photo as an image", async () => {
    const res = await call("get_task_files", { task: IDS.task.leak });
    assert.equal(res.content[1]?.type, "image");
    assert.equal(res.content[1].mimeType, "image/png");
    const none = await call("get_task_files", { task: IDS.task.paint });
    assert.deepEqual(JSON.parse(none.content[0].text), []);
  });
});

describe("doorloop_get", () => {
  test("only takes plain API paths", async () => {
    const res = await call("doorloop_get", { path: "https://example.com/x" });
    assert.equal(res.isError, true);
    assert.equal(mock.log.length, 0);
  });
});
