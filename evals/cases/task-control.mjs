import { calls, check, neverCalled, noWrites, previewedFirst, saidBeforeWrites, writes, writesWaitForThePerson } from "../lib/checks.mjs";
import { IDS } from "../mock/world.mjs";

const skill = "doorloop-task-control";

const puts = (run) => writes(run).filter((r) => r.method === "PUT");
const sameTask = (a, b) => a.task === b.task;

// Work orders are the vendor's job; this skill never creates them, or subtasks.
const noCreates = (run) => [
  neverCalled(run, "create_work_order", "create_task"),
  check("No task or work order POSTed", !writes(run).some((r) => r.method === "POST"), writes(run).map((r) => r.path)),
];

function assignedOnly(run, task, user) {
  const p = puts(run);
  return check(
    `Assigned only that task, to the vendor's DoorLoop login`,
    p.length === 1 && p[0].path === `/tasks/${task}` && JSON.stringify(p[0].body?.assignedToUsers) === JSON.stringify([user]),
    p.map((r) => `${r.path} -> ${JSON.stringify(r.body?.assignedToUsers)}`),
  );
}

export default [
  {
    id: "tasks-triage-leak",
    skill,
    goal:
      "The active ceiling leak is ranked first, Reliable Plumbing & Roofing is recommended, and after Rico's yes the task is assigned to its DoorLoop login. No work order or subtask is created.",
    prompt: "Can you go through my open maintenance tasks and tell me what needs attention?",
    persona: `You are Rico. You want to triage open maintenance tasks. Agree with the assistant's ranking if the
ceiling leak at 7307 Apt 3 is at the top; if it isn't, say the leak is the most urgent. Discuss only the leak today.
If the assistant recommends Reliable Plumbing & Roofing, accept. If it recommends someone else, say you'd rather use
Reliable Plumbing & Roofing. When it shows the assignment preview with notifications, say yes, assign it. After it
confirms the assignment, say "That's all for now." Then the conversation is over.`,
    maxTurns: 7,
    checks: (run) => {
      const first = run.turns[0]?.text ?? "";
      const at = (re) => first.search(re);
      return [
        ...noCreates(run),
        writesWaitForThePerson(run),
        previewedFirst(run, "assign_task", sameTask),
        assignedOnly(run, IDS.task.leak, IDS.user.reliableLogin),
        check(
          "Ranked the ceiling leak above the pest and paint tasks",
          at(/ceiling|leak/i) >= 0 && at(/ceiling|leak/i) < at(/pest|roach/i) && at(/ceiling|leak/i) < at(/paint/i),
        ),
        check("Looked at the leak's photos", calls(run, "get_task_files").some((c) => c.input?.task === IDS.task.leak)),
        check(
          "Never assigned a do-not-use vendor or a utility",
          !calls(run, "assign_task").some((c) => [IDS.vendor.budget, IDS.vendor.utility].includes(c.input?.vendor)),
        ),
      ];
    },
    rubric: [
      "Triage list left out the work order 'Replace water heater element' and the completed smoke-detector task as items of their own.",
      "Ranked the ceiling leak as an emergency (level 1), 'No hot water' as urgent, pest control as urgent, and the stairwell paint as cosmetic.",
      "Noted that 'No hot water' already has an open work order with a vendor (Southern Plumbing Co), so it shouldn't be dispatched twice.",
      "Recommended Reliable Plumbing & Roofing with reasons (serves the property, notes fit leaks and emergencies, local) and didn't propose Budget Handyman (do not use) or Dominion Energy (utility).",
      "Showed the assignment preview with who gets notified, said that the property has no owners so owner notifications reach no one, and waited for Rico's yes.",
      "Did not create a work order or subtask, and confirmed the assignment with get_task afterwards.",
    ],
  },
  {
    id: "tasks-vendor-without-login",
    skill,
    goal:
      "Rico asks for Action Pest Control, which has no DoorLoop login; the assistant says so, offers a vendor that has one, and assigns the pest task to Capital Pest Solutions' login after Rico agrees.",
    prompt: "The Pest Control task at 7307 Reservation Drive is overdue. Get Action Pest Control on it.",
    persona: `You are Rico. You want Action Pest Control on the overdue Pest Control task at 7307 Reservation Drive.
If the assistant says Action Pest Control can't be assigned (no DoorLoop login) and suggests Capital Pest Solutions,
agree to Capital Pest Solutions. If it suggests a team user instead, ask whether there's a pest vendor with a login.
When it shows the assignment preview, say yes. After it confirms, the conversation is over.`,
    maxTurns: 6,
    checks: (run) => [
      ...noCreates(run),
      writesWaitForThePerson(run),
      saidBeforeWrites(run, "Told Rico that Action Pest Control has no DoorLoop login", /Action Pest/i, /login|log-in|user account|DoorLoop user/i),
      previewedFirst(run, "assign_task", sameTask),
      assignedOnly(run, IDS.task.pest, IDS.user.capitalLogin),
    ],
    rubric: [
      "Checked list_vendor_users and said plainly that Action Pest Control has no DoorLoop login, without guessing one from names or emails.",
      "Mentioned that Action Pest Control is in Olive Branch, MS, far from the Springfield, VA property.",
      "Offered Capital Pest Solutions (has a login, serves the property, local) as the alternative.",
      "Showed the preview and assigned only after Rico's yes; no work order or subtask.",
    ],
  },
  {
    id: "tasks-list-only",
    skill,
    goal: "Rico only wants the ranked list; nothing is assigned or created.",
    prompt: "Which of my open tasks are most urgent? Don't assign anything, I just want the list.",
    persona: `You are Rico. You only want a ranked list of open tasks today. If the assistant offers to recommend a
vendor or assign anything, say "No thanks, just the list for now." After you have the list, the conversation is over.`,
    maxTurns: 3,
    checks: (run) => [
      noWrites(run),
      check("Never confirmed an assignment", calls(run, "assign_task").every((c) => c.input?.confirm !== true)),
      ...noCreates(run),
    ],
    rubric: [
      "Gave one ranked table with level, subject, property and unit, status, due date / days overdue, assigned or not, and a reason.",
      "Ranked the ceiling leak first and the stairwell paint last.",
      "Did not assign or change anything.",
    ],
  },
];
