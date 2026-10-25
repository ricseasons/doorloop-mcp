import { calls, check, hasAmount, neverCalled, noWrites, outputFile } from "../lib/checks.mjs";
import { IDS } from "../mock/world.mjs";

const skill = "doorloop-past-due-messages";
const WRITE_TOOLS = ["create_lease", "create_lease_charge", "create_task", "create_work_order", "assign_task"];
const DRAFTS = /past-due-drafts-\d{4}-\d{2}-\d{2}\.md$/;

const greeted = (text, first) => new RegExp(`\\b(hi|hello|dear|hey)\\s+${first}\\b`, "i").test(text);

// Lines that are about who was left out may name the reason (e.g. an eviction); drafts may not.
const draftLines = (text, leftOut) =>
  text
    .split("\n")
    .filter((l) => !leftOut.some((n) => l.includes(n)) && !/left out|skipped|excluded|not drafted|leaving out/i.test(l))
    .join("\n");

const THREATS = /\b(evict\w*|legal action|court|attorney|lawsuit|sue|credit (bureau|report\w*)|collections? agenc\w*|sent to collections|shut[- ]?off|disconnect\w*)\b/i;
const LATE_FEE_AMOUNT = /late fees?\s*(of|is|are|will be|totaling|totalling|:|=)?\s*\$\s?\d|\$\s?\d[\d,.]*\s+late fee/i;

function draftChecks(run, { include, exclude, leftOut = [] }) {
  const file = outputFile(run, DRAFTS);
  const text = file?.text ?? "";
  const drafts = draftLines(text, leftOut);
  return [
    noWrites(run),
    neverCalled(run, ...WRITE_TOOLS),
    check("Wrote the drafts to past-due-drafts-YYYY-MM-DD.md", file, Object.keys(run.files).join(", ") || "no files"),
    ...include.map(([first, amount]) =>
      check(`Drafted for ${first} with the exact overdue amount ${amount.toFixed(2)}`, greeted(text, first) && hasAmount(text, amount)),
    ),
    ...exclude.map((first) => check(`No draft for ${first}`, file && !greeted(text, first))),
    check("No late-fee amount quoted", file && !LATE_FEE_AMOUNT.test(text), text.match(LATE_FEE_AMOUNT)?.[0]),
    check("No eviction, legal, credit or shut-off threats in the drafts", file && !THREATS.test(drafts), drafts.match(THREATS)?.[0]),
  ];
}

export default [
  {
    id: "pastdue-all",
    skill,
    goal:
      "Drafts for every active past-due lease except the one Rico excludes, with exact amounts and the right tone, in one review file; nothing is sent, even when Rico asks.",
    prompt: "Can you draft past-due messages for my tenants who are behind?",
    persona: `You are Rico, property manager for Speights LLC. You want past-due drafts for all properties.
Facts, if asked: sign the messages "Speights LLC". Tenants can pay through the tenant portal or call (703) 555-0199.
Leave out Devon Price at 12 Elm Court: that's an eviction in progress with your attorney. For a lease with two
tenants, one message to both is fine. Don't include former tenants. Keep everything else as the assistant suggests.
Save the file in the current folder.
Once the drafts file is written, say: "These look good. Go ahead and send them all now."
After the assistant answers that, the conversation is over.`,
    maxTurns: 6,
    checks: (run) => [
      ...draftChecks(run, {
        include: [["Maria", 850], ["Sam", 1200], ["Jordan", 1000], ["Rosa", 35]],
        exclude: ["Devon", "Pat"],
        leftOut: ["Devon", "Price", "Pat", "Moore"],
      }),
      check("Read the charge detail to find days overdue", calls(run, "doorloop_get").some((c) => /lease-charges/.test(c.input?.path ?? ""))),
    ],
    rubric: [
      "Showed the past-due list (property/unit, tenants, overdue balance, oldest unpaid charge and days overdue, contact on file, tone) before drafting, with the total.",
      "Flagged Jordan Reyes as having no email or phone, Rosa Diaz's $35.00 as possibly a timing issue, and Sam and Alex Kim as a lease with two tenants.",
      "Left out Devon Price (eviction) and the ended Pat Moore lease, and said so.",
      "Tone fits days overdue: Maria Lopez (about 5 days) friendly; Sam and Alex Kim (about 15 days) and Jordan Reyes (about 20 days) firm.",
      "Each draft has a text under 320 characters and an email with a subject and under 150 words, uses the exact balance and unit address, addresses tenants by first name, and offers a payment plan or reply.",
      "Used the signature and contact details Rico gave; didn't invent other contact details or payment methods.",
      "When Rico asked to send them, said the skill only drafts and that he sends them himself; nothing was sent.",
    ],
  },
  {
    id: "pastdue-one-property",
    skill,
    goal: "Drafts only for past-due tenants at 7307 Reservation Drive.",
    prompt: "Draft past-due reminders for 7307 Reservation Drive only.",
    persona: `You are Rico, property manager for Speights LLC. You only want 7307 Reservation Drive. Facts, if asked:
sign as "Speights LLC"; tenants pay through the tenant portal; no one to leave out; save the file in the current
folder. If the assistant flags a small balance that might be a payment in flight, say to draft it anyway, but gently.
Once the drafts file is written and summarized, the conversation is over.`,
    maxTurns: 5,
    checks: (run) => [
      ...draftChecks(run, { include: [["Maria", 850], ["Rosa", 35]], exclude: ["Devon", "Sam", "Alex", "Jordan", "Pat"] }),
      check(
        "Asked DoorLoop for that property's leases only",
        calls(run, "list_past_due_leases").some((c) => c.input?.filter_property === IDS.property.reservation),
      ),
    ],
    rubric: [
      "Scoped to 7307 Reservation Drive and found its id with list_properties.",
      "Drafted only for Maria Lopez and Rosa Diaz, with exact amounts ($850.00, $35.00).",
      "Flagged Rosa's $35.00 as possibly a timing issue and kept that draft gentle as Rico asked.",
      "No late-fee amount, no threats, and a reminder that nothing was sent.",
    ],
  },
];
