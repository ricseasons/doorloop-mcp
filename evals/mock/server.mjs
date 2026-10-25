// A fake DoorLoop API for the evals. It serves the seeded world from world.mjs, applies writes to it, and
// logs every request so graders can check exactly what a skill sent. It never talks to the real DoorLoop.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { buildWorld } from "./world.mjs";

// A 1x1 PNG, served for task photos.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const newId = () => randomBytes(12).toString("hex");

export async function startMock({ world = buildWorld(), port = 0 } = {}) {
  const log = [];
  let turn = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    const query = Object.fromEntries(url.searchParams);
    let body;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }

    const entry = { turn, method: req.method, path, query, body, authorized: /^bearer \S+/i.test(req.headers.authorization ?? "") };
    let status = 200;
    let out;
    try {
      [status, out] = route(world, req.method, path, query, body);
    } catch (e) {
      [status, out] = [500, { message: String(e) }];
    }
    entry.status = status;
    log.push(entry);

    if (Buffer.isBuffer(out)) {
      res.writeHead(status, { "content-type": "image/png" });
      res.end(out);
    } else {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(out ?? {}));
    }
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const { port: actual } = server.address();
  return {
    url: `http://127.0.0.1:${actual}/api`,
    world,
    log,
    setTurn: (n) => (turn = n),
    writes: () => log.filter((e) => e.method !== "GET"),
    close: () => new Promise((r) => server.close(r)),
  };
}

function page(items, query) {
  const size = Math.min(Number(query.page_size) || 50, 100);
  const number = Math.max(Number(query.page_number) || 1, 1);
  return [200, { data: items.slice((number - 1) * size, number * size), total: items.length }];
}

const notFound = [404, { message: "Not found" }];
const byId = (items, id) => (items.find((x) => x.id === id) ? [200, items.find((x) => x.id === id)] : notFound);

function route(w, method, path, q, body) {
  const [, collection, id, sub] = path.split("/");

  if (method === "GET") {
    switch (collection) {
      case "users":
        if (id === "me") return [200, w.users[0]];
        return id ? byId(w.users, id) : page(w.users, q);
      case "properties":
        return id ? byId(w.properties, id) : page(w.properties, q);
      case "units":
        if (id) return byId(w.units, id);
        return page(w.units.filter((u) => !q.filter_property || u.property === q.filter_property), q);
      case "tenants": {
        if (id) return byId(w.tenants, id);
        let list = w.tenants;
        if (q.filter_lease) list = list.filter((t) => t.leases.includes(q.filter_lease));
        if (q.filter_text) {
          const s = q.filter_text.toLowerCase();
          list = list.filter((t) => JSON.stringify([t.name, t.emails, t.phones]).toLowerCase().includes(s));
        }
        return page(list, q);
      }
      case "leases":
        if (id) return byId(w.leases, id);
        return page(
          w.leases.filter(
            (l) => (!q.filter_property || l.property === q.filter_property) && (!q.filter_unit || l.units.includes(q.filter_unit)),
          ),
          q,
        );
      case "lease-charges":
        if (id) return byId(w.leaseCharges, id);
        return page(w.leaseCharges.filter((c) => !q.filter_lease || c.lease === q.filter_lease), q);
      case "accounts":
        return id ? byId(w.accounts, id) : page(w.accounts, q);
      case "tasks": {
        if (id) return byId(w.tasks, id);
        const list = w.tasks.filter(
          (t) =>
            (!q.filter_status || t.status === q.filter_status) &&
            (!q.filter_property || t.property === q.filter_property) &&
            (!q.filter_type || t.type === q.filter_type) &&
            (!q.filter_dueDate_to || (t.dueDate && t.dueDate <= q.filter_dueDate_to)) &&
            (!q.filter_linkedResourceId || t.linkedResource?.resourceId === q.filter_linkedResourceId),
        );
        return page(list, q);
      }
      case "files":
        if (id && sub === "download") return w.files.some((f) => f.id === id) ? [200, PNG] : notFound;
        // Like the real API, /files ignores filters.
        return id ? byId(w.files, id) : page(w.files, q);
      case "vendors": {
        if (id) return byId(w.vendors, id);
        const s = q.filter_text?.toLowerCase();
        return page(s ? w.vendors.filter((v) => JSON.stringify(v).toLowerCase().includes(s)) : w.vendors, q);
      }
      case "reports":
        if (id === "rent-roll") return [200, rentRoll(w, q)];
        return notFound;
      default:
        return notFound;
    }
  }

  if (method === "POST" && collection === "leases" && id === "full") return createLease(w, body);
  if (method === "POST" && collection === "lease-charges" && !id) return createCharge(w, body);
  if (method === "POST" && collection === "tasks" && !id) {
    const task = { id: newId(), ...body };
    w.tasks.push(task);
    return [200, task];
  }
  if (method === "PUT" && collection === "tasks" && id) {
    const i = w.tasks.findIndex((t) => t.id === id);
    if (i < 0) return notFound;
    w.tasks[i] = { ...body, id };
    return [200, w.tasks[i]];
  }
  // What the real API says to an API key for these (see README).
  if (method === "POST" && (collection === "units" || (collection === "properties" && id === "create-property-wizard"))) {
    return [405, { message: "Access Denied" }];
  }
  return [405, { message: `${method} ${path} is not supported by the fake DoorLoop` }];
}

function createLease(w, b) {
  const missing = ["property", "units", "term", "start", "tenants"].filter((k) => b?.[k] === undefined);
  if (missing.length) return [400, { message: `Missing ${missing.join(", ")}` }];
  if (!w.properties.some((p) => p.id === b.property)) return [400, { message: "Unknown property" }];
  const bad = b.units.filter((u) => !w.units.some((x) => x.id === u && x.property === b.property));
  if (bad.length) return [400, { message: `Unknown unit ${bad.join(", ")} for this property` }];
  const accountIds = [
    ...(b.rent?.lines ?? []),
    ...(b.securityDeposits ?? []).flatMap((d) => d.lines),
    ...(b.recurringCharges ?? []).flatMap((c) => c.lines),
  ].map((l) => l.account);
  const unknown = accountIds.filter((a) => !w.accounts.some((x) => x.id === a));
  if (unknown.length) return [400, { message: `Unknown account ${unknown.join(", ")}` }];

  const lease = {
    id: newId(),
    name: `Lease ${b.start}`,
    property: b.property,
    units: b.units,
    status: "ACTIVE",
    term: b.term,
    start: b.start,
    end: b.end,
    overdueBalance: 0,
    totalBalanceDue: 0,
    automaticLateFees: b.automaticLateFees,
  };
  const tenantIds = b.tenants.map((t) => {
    if (typeof t === "string") {
      w.tenants.find((x) => x.id === t)?.leases.push(lease.id);
      return t;
    }
    const tenant = {
      id: newId(),
      ...t,
      name: `${t.firstName} ${t.lastName}`,
      leases: [lease.id],
      emails: t.email ? [{ type: "Primary", address: t.email }] : [],
      phones: t.phone ? [{ type: "Mobile", number: t.phone }] : [],
    };
    w.tenants.push(tenant);
    return tenant.id;
  });
  w.leases.push(lease);
  return [200, { ...lease, tenants: tenantIds }];
}

function createCharge(w, b) {
  if (!w.leases.some((l) => l.id === b?.lease)) return [400, { message: "Unknown lease" }];
  const charge = { id: newId(), ...b, totalAmount: b.lines.reduce((s, l) => s + l.amount, 0) };
  w.leaseCharges.push(charge);
  return [200, charge];
}

function rentRoll(w, q) {
  const data = w.units
    .filter((u) => !q.filter_property || u.property === q.filter_property)
    .map((u) => {
      const lease = w.leases.find((l) => l.units.includes(u.id) && l.status === "ACTIVE");
      return {
        unit: { id: u.id, name: u.name },
        property: u.property,
        lease: lease ? { id: lease.id, start: lease.start, end: lease.end } : null,
        tenants: lease ? w.tenants.filter((t) => t.leases.includes(lease.id)).map((t) => t.name) : [],
        balance: lease?.totalBalanceDue ?? 0,
      };
    });
  return { data, total: data.length };
}

// `node evals/mock/server.mjs` runs it on its own, e.g. to poke at it by hand.
if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startMock({ port: Number(process.env.PORT) || 4010 });
  console.log(`Fake DoorLoop at ${mock.url}`);
}
