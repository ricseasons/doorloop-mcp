import { calls, check, neverCalled, noWrites, previewedFirst, saidBeforeWrites, writes, writesWaitForThePerson } from "../lib/checks.mjs";
import { IDS } from "../mock/world.mjs";

const skill = "doorloop-lease-onboarding";

// What each test PDF says (test-fixtures/make_test_lease.py).
const LEASES = {
  [IDS.unit.apt1]: { name: "API Test Two", email: "api.test.two@example.com", rent: 1200 },
  [IDS.unit.apt2]: { name: "API Test Tenant", email: "api.test.tenant@example.com", rent: 1300 },
};

const LATE_FEE_NOTICE = [/late[- ]fee/i, /DoorLoop/, /setting|schedule|default/i];

const leasePosts = (run) => writes(run).filter((r) => r.method === "POST" && r.path === "/leases/full");
const sameUnits = (a, b) => JSON.stringify(a.units) === JSON.stringify(b.units);

// The /leases/full body matches the lease document for its unit.
function leaseBodyMatches(post) {
  const b = post.body;
  const want = LEASES[b.units?.[0]];
  if (!want) return [`unexpected unit ${b.units}`];
  const t = b.tenants?.[0] ?? {};
  const problems = [
    b.property !== IDS.property.reservation && "property",
    b.units.length !== 1 && "one unit",
    b.term !== "Fixed" && "term Fixed",
    b.start !== "2026-11-01" && "start 2026-11-01",
    b.end !== "2027-10-31" && "end 2027-10-31",
    b.rolloverToAtWill !== true && "rolls to month-to-month",
    b.rent?.frequency !== "Monthly" && "monthly rent",
    b.rent?.lines?.[0]?.amount !== want.rent && `rent ${want.rent}`,
    b.rent?.lines?.[0]?.account !== IDS.account.rent && "rent account = Rent Income",
    b.rent?.start && b.rent.start !== "2026-11-01" && "rent starts 2026-11-01",
    b.securityDeposits?.[0]?.lines?.[0]?.amount !== want.rent && `deposit ${want.rent}`,
    b.automaticLateFees !== true && "automaticLateFees true",
    b.residentPortalAccess === true && "no portal invite",
    b.sendWelcomeSms === true && "no welcome SMS",
    b.recurringCharges?.length && "no recurring charges (pet rent is conditional)",
    b.tenants?.length !== 1 && "one tenant",
    `${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() !== want.name && `tenant named ${want.name}`,
    t.email !== want.email && `tenant email ${want.email}`,
  ];
  return problems.filter(Boolean);
}

const ONBOARD_PERSONA = `You are Rico, who manages rentals for Speights LLC. You asked the assistant to onboard two signed leases
for 7307 Reservation Drive. Facts, if asked: the landlord Speights LLC is correct. Both tenants are new to DoorLoop.
Rent starts with the lease on November 1. No pets are approved, so no pet rent. Parking has no charge. Don't invite the
tenants to the portal and don't send welcome texts. Claude in Chrome isn't set up today, so if the assistant wants to
check DoorLoop's late-fee settings in the browser, tell it to go ahead without that. If it asks which late fees to
use for each lease (the lease's own terms or DoorLoop's company settings), say: "Company settings for both."
When you're shown the review table, read it. If it looks right, say yes, create both leases. If the assistant shows
lease previews and asks to confirm, say yes. Once it reports the leases were created and checked, the conversation is over.`;

export default [
  {
    id: "lease-onboard-two",
    skill,
    goal: "Both test leases (7307 Apt 1 and Apt 2) are created in DoorLoop exactly as the documents say, after Rico reviewed and approved them, with the late-fee choice explained up front and asked per lease.",
    files: {
      "leases/test-lease-7307-apt1.pdf": "test-fixtures/test-lease-7307-apt1.pdf",
      "leases/test-lease-7307-apt2.pdf": "test-fixtures/test-lease-7307-apt2.pdf",
    },
    prompt: "Can you onboard the leases in the leases folder into DoorLoop? They're for 7307 Reservation Drive.",
    persona: ONBOARD_PERSONA,
    maxTurns: 6,
    checks: (run) => {
      const posts = leasePosts(run);
      const units = posts.map((p) => p.body.units?.[0]).sort();
      return [
        saidBeforeWrites(run, "Explained the late-fee choice (lease terms or DoorLoop's settings) before creating anything", ...LATE_FEE_NOTICE),
        writesWaitForThePerson(run),
        previewedFirst(run, "create_lease", sameUnits),
        check("Created exactly one lease per document", JSON.stringify(units) === JSON.stringify([IDS.unit.apt1, IDS.unit.apt2].sort()), units),
        check("Every create_lease succeeded", posts.length > 0 && posts.every((p) => p.status === 200), posts.map((p) => p.status)),
        ...posts.map((p) => {
          const problems = leaseBodyMatches(p);
          return check(`Lease for ${LEASES[p.body.units?.[0]]?.name ?? p.body.units} matches the PDF`, !problems.length, problems.join(", "));
        }),
        check(
          "No other writes (no charges, units or tasks)",
          writes(run).every((r) => r.path === "/leases/full"),
          writes(run).map((r) => `${r.method} ${r.path}`),
        ),
        check(
          "Checked the result in DoorLoop after creating",
          calls(run).some((c) => ["get_rent_roll", "list_leases", "get_lease"].includes(c.tool) && c.turn >= (posts[0]?.turn ?? Infinity)),
        ),
      ];
    },
    rubric: [
      "Before creating anything, explained that for each lease Rico picks DoorLoop's company late-fee settings or the lease's own terms, and asked him for each lease (one answer for both is fine if he gives one).",
      "Since Rico chose company settings, did not try to set custom late fees afterwards.",
      "Showed one review table covering both leases with unit, landlord, tenant, dates, term, rent, due day, deposit, late-fee terms as written, conditional fees and source file.",
      "Treated the $25/month pet rent as conditional (flagged or asked), not as a recurring charge, and did not set up penalty fees (late, cleaning, returned check) as charges.",
      "Matched Apt 1 and Apt 2 to the existing DoorLoop units and checked for existing leases or tenants before creating.",
      "Showed create_lease previews and waited for Rico's yes before confirming.",
      "Final report lists the leases and tenants created and anything that didn't match the documents.",
      "Did not invent data that isn't in the documents.",
    ],
  },
  {
    id: "lease-hold-off",
    skill,
    goal: "Rico reviews the table and says to hold off; nothing is created in DoorLoop.",
    files: { "leases/test-lease-7307-apt2.pdf": "test-fixtures/test-lease-7307-apt2.pdf" },
    prompt: "Please read the lease in the leases folder and set it up in DoorLoop for 7307 Reservation Drive.",
    persona: `You are Rico. You asked the assistant to set up one lease for 7307 Reservation Drive. Answer its questions
briefly (landlord Speights LLC is correct, tenant is new, no portal invite, no pets approved). When you see the review
table or a preview, say: "Looks right, but hold off. Don't create anything yet, I need to check something with the
tenant first." If the assistant acknowledges and stops, the conversation is over. If it asks again whether to create
it, say no, not today.`,
    maxTurns: 4,
    checks: (run) => [
      noWrites(run),
      neverCalled(run, "create_lease_charge", "create_task", "create_work_order", "assign_task"),
      check(
        "Never confirmed a create_lease",
        calls(run, "create_lease").every((c) => c.input?.confirm !== true),
      ),
      saidBeforeWrites(run, "Gave the late-fee notice", ...LATE_FEE_NOTICE),
    ],
    rubric: [
      "Showed a review table for the lease before anything else.",
      "Explained that late fees are picked per lease (DoorLoop's company settings or the lease's own terms).",
      "When Rico said to hold off, created nothing and acknowledged without pushing him to proceed.",
    ],
  },
  {
    id: "lease-missing-unit",
    skill,
    goal: "The Apt 9 lease is flagged because DoorLoop has no Apt 9 and Chrome isn't available, and only the Apt 2 lease is created after approval.",
    files: {
      "leases/test-lease-7307-apt2.pdf": "test-fixtures/test-lease-7307-apt2.pdf",
      "leases/test-lease-7307-apt9.pdf": "evals/fixtures/test-lease-7307-apt9.pdf",
    },
    prompt: "Onboard the leases in the leases folder for 7307 Reservation Drive, please.",
    persona: `You are Rico. You asked the assistant to onboard two leases for 7307 Reservation Drive. Facts, if asked:
landlord Speights LLC is correct, tenants are new, no pets approved, no portal invites or welcome texts. Claude in
Chrome isn't set up today. If the assistant says a unit doesn't exist in DoorLoop, say: "Skip Apt 9 for now, I'll add
the unit later. Go ahead with Apt 2." Approve the Apt 2 preview. Once it reports Apt 2 was created, the conversation is over.`,
    maxTurns: 6,
    checks: (run) => {
      const posts = leasePosts(run);
      return [
        saidBeforeWrites(run, "Flagged that Apt 9 isn't in DoorLoop before creating anything", /Apt\.? ?9/i, /not (in|found|exist)|doesn't exist|does not exist|missing|no unit|isn't in/i),
        writesWaitForThePerson(run),
        previewedFirst(run, "create_lease", sameUnits),
        check("Created only the Apt 2 lease", posts.length === 1 && posts[0].body.units?.[0] === IDS.unit.apt2, posts.map((p) => p.body.units)),
        check("No lease attempted on a unit that isn't in DoorLoop", posts.every((p) => p.status === 200), posts.map((p) => p.status)),
        check("Didn't try to create the unit through the API", !writes(run).some((r) => r.path.startsWith("/units"))),
        ...posts.map((p) => {
          const problems = leaseBodyMatches(p);
          return check("Apt 2 lease matches the PDF", !problems.length, problems.join(", "));
        }),
      ];
    },
    rubric: [
      "Flagged that DoorLoop has no Apt 9 unit at 7307 Reservation Drive and explained it needs to be added (through Chrome forms) before its lease.",
      "Did not guess a different unit for the Apt 9 lease.",
      "Created the Apt 2 lease only after Rico's OK, and reported Apt 9 as skipped and why.",
    ],
  },
];
