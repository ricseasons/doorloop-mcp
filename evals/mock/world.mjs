// The fake DoorLoop account the evals run against. Every person, vendor and balance here is made up.
// Dates are relative to the day the world is built, so "5 days overdue" stays true whenever it runs.

export const IDS = {
  user: { me: "u0000000000000000000001", james: "u0000000000000000000002", reliableLogin: "u00000000000000000000a1", capitalLogin: "u00000000000000000000a3" },
  property: { reservation: "6ad96a8e9a9b566b7e0bb3a6", elm: "p00000000000000000000e1" },
  unit: {
    apt1: "6ad96a909a9b566b7e0bb3dd",
    apt2: "6ad96a909a9b566b7e0bb3f1",
    apt3: "un0000000000000000000a3",
    apt4: "un0000000000000000000a4",
    elmA: "un00000000000000000e0a1",
    elmB: "un00000000000000000e0b1",
    elmC: "un00000000000000000e0c1",
  },
  lease: {
    maria: "le0000000000000000000a3",
    rosa: "le0000000000000000000a4",
    devon: "le00000000000000000e0a1",
    kims: "le00000000000000000e0b1",
    noContact: "le00000000000000000e0c1",
    ended: "le00000000000000000e0d1",
    oldApt3: "le0000000000000000000a5",
  },
  task: {
    leak: "7d05c632041ee1da6d897b7e",
    pest: "6ad9736b315f38741ee8102f",
    paint: "02ac6948327029cd2967c45b",
    hotWater: "856ad7a33cea13a8a790de91",
    hotWaterWO: "daa877b7932c81043d96530b",
    doneOverdue: "47b43cf2afb39a6d4315c8c5",
  },
  vendor: {
    reliable: "f794b19e8ab5a27e2db158bb",
    actionPest: "fe938756765a288b67487ad8",
    capitalPest: "61dbed3404fbbf541bfd275f",
    budget: "467f4190b784cf269e1e723e",
    utility: "9d70d1ccc27dfdbf1aeef08b",
    oldPlumber: "5d704e655655f0526d3ef1fe",
  },
  account: { rent: "5efce083b89ac3732226fd8c", deposit: "ac00000000000000000d0001", lateFees: "7c95500027b272a8bc9dcadb" },
};

// Vendor id -> that vendor's DoorLoop user, as vendor-users.json holds it. Action Pest Control has no login.
export const VENDOR_USERS = {
  _comment: "Eval fixture",
  [IDS.vendor.reliable]: IDS.user.reliableLogin,
  [IDS.vendor.capitalPest]: IDS.user.capitalLogin,
};

const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export function buildWorld() {
  const { user, property, unit, lease, task, vendor, account } = IDS;

  const users = [
    { id: user.me, firstName: "Marico", lastName: "Hawes", name: "Marico Hawes", emails: [{ type: "Primary", address: "marico@example.com" }] },
    { id: user.james, firstName: "James", lastName: "Speights", name: "James Speights" },
    { id: user.reliableLogin, firstName: "Reliable", lastName: "Plumbing", name: "Reliable Plumbing" },
    { id: user.capitalLogin, firstName: "Capital", lastName: "Pest", name: "Capital Pest Solutions" },
  ];

  const properties = [
    {
      id: property.reservation,
      name: "7307 Reservation Drive",
      address: { street1: "7307 Reservation Drive", city: "Springfield", state: "VA", zip: "22153" },
      owners: [],
      active: true,
    },
    {
      id: property.elm,
      name: "12 Elm Court",
      address: { street1: "12 Elm Court", city: "Olive Branch", state: "MS", zip: "38654" },
      owners: [{ owner: "ebd4de13e7612d5901fb1321", ownershipPercentage: 100 }],
      active: true,
    },
  ];

  const u = (id, prop, name, marketRent) => ({ id, property: prop, name, active: true, marketRent, beds: 2, baths: 1 });
  const units = [
    u(unit.apt1, property.reservation, "Apt 1", 1200),
    u(unit.apt2, property.reservation, "Apt 2", 1300),
    u(unit.apt3, property.reservation, "Apt 3", 1250),
    u(unit.apt4, property.reservation, "Apt 4", 1250),
    u(unit.elmA, property.elm, "Unit A", 950),
    u(unit.elmB, property.elm, "Unit B", 1100),
    u(unit.elmC, property.elm, "Unit C", 1000),
  ];

  const t = (id, firstName, lastName, leaseId, email, phone) => ({
    id,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    leases: [leaseId],
    emails: email ? [{ type: "Primary", address: email }] : [],
    phones: phone ? [{ type: "Mobile", number: phone }] : [],
  });
  const tenants = [
    t("e68c4bc7a66ca25afa4e63af", "Maria", "Lopez", lease.maria, "maria.lopez@example.com", "(703) 555-0101"),
    t("f07e37c1d06e735ba6c8d322", "Devon", "Price", lease.devon, "devon.price@example.com", "(662) 555-0102"),
    t("53b23cd401184b129dc33984", "Sam", "Kim", lease.kims, "sam.kim@example.com", "(662) 555-0103"),
    t("a8d22c828a9005dc12dce12c", "Alex", "Kim", lease.kims, "alex.kim@example.com", null),
    t("bde58b6fb20574775ad3c072", "Jordan", "Reyes", lease.noContact, null, null),
    t("d059a942ef06fc1252023880", "Pat", "Moore", lease.ended, "pat.moore@example.com", "(662) 555-0106"),
    t("6b7eda6ad9dcd442be0c4257", "Rosa", "Diaz", lease.rosa, "rosa.diaz@example.com", "(703) 555-0107"),
    t("f062d6c3d7a163f26fbc042d", "Chris", "Bell", lease.oldApt3, "chris.bell@example.com", "(703) 555-0108"),
  ];

  const l = (id, prop, unitId, name, status, start, end, overdueBalance, totalBalanceDue) => ({
    id,
    name,
    property: prop,
    units: [unitId],
    status,
    term: "Fixed",
    start,
    end,
    overdueBalance,
    totalBalanceDue,
  });
  const leases = [
    l(lease.maria, property.reservation, unit.apt3, "Apt 3 - Maria Lopez", "ACTIVE", "2026-03-01", "2027-02-28", 850, 850),
    l(lease.rosa, property.reservation, unit.apt4, "Apt 4 - Rosa Diaz", "ACTIVE", "2026-05-01", "2027-04-30", 35, 35),
    l(lease.devon, property.elm, unit.elmA, "Unit A - Devon Price", "ACTIVE", "2025-09-01", "2026-08-31", 2750.5, 3700.5),
    l(lease.kims, property.elm, unit.elmB, "Unit B - Sam Kim, Alex Kim", "ACTIVE", "2026-01-15", "2027-01-14", 1200, 1200),
    l(lease.noContact, property.elm, unit.elmC, "Unit C - Jordan Reyes", "ACTIVE", "2026-02-01", "2027-01-31", 1000, 1000),
    l(lease.ended, property.elm, unit.elmC, "Unit C - Pat Moore", "INACTIVE", "2024-02-01", "2025-01-31", 410.25, 410.25),
    l(lease.oldApt3, property.reservation, unit.apt3, "Apt 3 - Chris Bell (old)", "INACTIVE", "2025-01-01", "2026-01-31", 0, 0),
  ];

  // Open rent charges behind each overdue balance; the oldest one sets how long it's been overdue.
  const c = (id, leaseId, date, amount, balance, memo = "Rent") => ({
    id,
    lease: leaseId,
    date,
    totalAmount: amount,
    totalBalance: balance,
    memo,
    lines: [{ account: account.rent, amount, balance, memo }],
  });
  const leaseCharges = [
    c("9fb44122834cb90f24062e80", lease.maria, day(-5), 1250, 850),
    c("f43b1ee763cfd10257861c78", lease.rosa, day(-2), 1250, 35),
    c("a712295feff568a7adc80075", lease.devon, day(-45), 950, 850.5),
    c("c5c60a8bad8b7ecc52b00db4", lease.devon, day(-15), 950, 950),
    c("fb7133bccab24d3eb57e3111", lease.devon, day(10), 950, 950),
    c("295e45a46b8a6912a911b09e", lease.kims, day(-15), 1100, 1100),
    c("96b68da3b6306f93596d0efa", lease.kims, day(-15), 100, 100, "Parking"),
    c("b65c6d37816838c366e99d6a", lease.noContact, day(-20), 1000, 1000),
    c("86c2255793a3210fb9cad1d2", lease.ended, day(-400), 410.25, 410.25, "Final balance"),
  ];

  // More than 100 accounts so a single page isn't enough; the rent and deposit defaults are on page 2.
  const accounts = [];
  for (let i = 1; i <= 112; i++) {
    accounts.push({ id: `ac${String(i).padStart(22, "0")}`, name: `Expense ${String(i).padStart(3, "0")}`, class: "EXPENSE", active: true });
  }
  accounts.push(
    { id: account.lateFees, name: "Late Fees", class: "REVENUE", active: true },
    { id: "6e3711c00afea8cc87496907", name: "Pet Fees", class: "REVENUE", active: true },
    { id: "4ecf8481e6c9ddd5f1a3cb96", name: "Parking", class: "REVENUE", active: true },
    { id: "ac00000000000000000c0001", name: "Cleaning Fee", class: "REVENUE", active: true },
    { id: "3d8491521e0b8dd968709f8c", name: "Pet Deposit", class: "LIABILITY", active: true },
    { id: "ac00000000000000000c0002", name: "Late Fee (old)", class: "REVENUE", active: false },
    { id: account.rent, name: "Rent Income", class: "REVENUE", active: true, defaultAccountFor: ["RENTAL_INCOME"] },
    { id: account.deposit, name: "Security Deposits Held", class: "LIABILITY", active: true, defaultAccountFor: ["SECURITY_DEPOSIT"] },
  );

  const tk = (id, fields) => ({
    id,
    reference: id.slice(-6),
    status: "NOT_STARTED",
    priority: "MEDIUM",
    assignedToUsers: [],
    notifyAssignees: false,
    notifyOwners: false,
    notifyTenants: false,
    createdAt: `${day(-3)}T14:00:00.000Z`,
    ...fields,
  });
  const tasks = [
    tk(task.leak, {
      subject: "Water coming through bathroom ceiling",
      description:
        "Water is dripping from the bathroom ceiling light fixture and the ceiling is sagging. It started last night and is getting worse. We put a bucket under it.",
      type: "TENANT_REQUEST",
      tenantRequestType: "MAINTENANCE",
      priority: "HIGH",
      property: property.reservation,
      unit: unit.apt3,
      requestedByTenant: "e68c4bc7a66ca25afa4e63af",
      entryPermission: "YES",
      dueDate: day(-1),
    }),
    tk(task.pest, {
      subject: "Pest Control",
      description: "Roaches reported in the kitchen of Apt 4. Needs a pest treatment.",
      type: "INTERNAL_TASK",
      property: property.reservation,
      unit: unit.apt4,
      dueDate: day(-6),
    }),
    tk(task.paint, {
      subject: "Touch up paint in the stairwell",
      description: "Scuffs on the stairwell walls. Can wait until the next turnover.",
      type: "INTERNAL_TASK",
      priority: "LOW",
      property: property.reservation,
    }),
    tk(task.hotWater, {
      subject: "No hot water",
      description: "Tenant says there has been no hot water since yesterday morning.",
      type: "TENANT_REQUEST",
      tenantRequestType: "MAINTENANCE",
      priority: "HIGH",
      property: property.elm,
      unit: unit.elmB,
      requestedByTenant: "53b23cd401184b129dc33984",
      status: "IN_PROGRESS",
      dueDate: day(-2),
    }),
    tk(task.hotWaterWO, {
      subject: "Replace water heater element",
      type: "WORK_ORDER",
      property: property.elm,
      unit: unit.elmB,
      workOrder: { assignedToVendor: vendor.oldPlumber, approvedByOwner: true },
      linkedResource: { resourceId: task.hotWater, resourceType: "TASK" },
    }),
    tk(task.doneOverdue, {
      subject: "Replace smoke detector batteries",
      type: "INTERNAL_TASK",
      property: property.elm,
      status: "COMPLETED",
      dueDate: day(-20),
    }),
  ];

  const files = [
    { id: "b68de33f524fcfae4d22aa33", name: "ceiling.png", mimeType: "image/png", size: 68, linkedResource: { resourceId: task.leak, resourceType: "TASK" } },
  ];

  const v = (id, fields) => ({ id, active: true, properties: [], notes: "", services: [], ...fields });
  const vendors = [
    v(vendor.reliable, {
      name: "Reliable Plumbing & Roofing",
      companyName: "Reliable Plumbing & Roofing LLC",
      notes: "Emergency calls 24/7. Preferred for leaks and water damage.",
      properties: [property.reservation],
      primaryAddress: { city: "Springfield", state: "VA" },
    }),
    v(vendor.actionPest, {
      name: "Action Pest Control",
      notes: "Good prices on recurring treatments.",
      services: ["Pest Control"],
      primaryAddress: { city: "Olive Branch", state: "MS" },
    }),
    v(vendor.capitalPest, {
      name: "Capital Pest Solutions",
      notes: "Pest control and exterminator.",
      properties: [property.reservation],
      primaryAddress: { city: "Springfield", state: "VA" },
    }),
    v(vendor.budget, {
      name: "Budget Handyman",
      notes: "Do not use - no-show twice in 2025.",
      properties: [property.reservation],
      primaryAddress: { city: "Springfield", state: "VA" },
    }),
    v(vendor.utility, { name: "Dominion Energy", notes: "Electric utility", primaryAddress: { city: "Richmond", state: "VA" } }),
    v(vendor.oldPlumber, {
      name: "Southern Plumbing Co",
      notes: "Plumbing, water heaters.",
      properties: [property.elm],
      primaryAddress: { city: "Olive Branch", state: "MS" },
    }),
  ];

  return { users, properties, units, tenants, leases, leaseCharges, accounts, tasks, files, vendors };
}
