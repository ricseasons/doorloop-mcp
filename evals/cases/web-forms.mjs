import { calls, check, noWrites } from "../lib/checks.mjs";

// The evals have no browser, so this checks the skill's "Before you start" path: it notices Claude in
// Chrome is missing and walks the person through setup, instead of faking the unit some other way.
export default [
  {
    id: "webforms-no-chrome",
    skill: "doorloop-web-forms",
    goal:
      "With no Claude in Chrome tools, the assistant doesn't create or pretend to create the unit; it explains Chrome is needed and starts the setup one step at a time.",
    prompt: "Add a unit called Apt 5 to 7307 Reservation Drive: 2 beds, 1 bath, 850 sq ft, listing price $1,250.",
    persona: `You are Rico. You want a new unit Apt 5 on 7307 Reservation Drive. Facts, if asked: you're on a Mac and use
the Claude desktop app. If the assistant gives you a setup step, say "I'll do the Chrome setup later, thanks." Then the
conversation is over.`,
    maxTurns: 3,
    checks: (run) => {
      const all = run.turns.map((t) => t.text).join("\n");
      return [
        noWrites(run),
        check("Said Claude in Chrome is needed", /Claude in Chrome|Chrome extension|browser extension/i.test(all)),
        check(
          "Never claimed the unit was added",
          !/\b(I('ve| have)|has been|was|successfully) (added|created|saved)\b[^.]*\b(Apt 5|unit)\b/i.test(all),
          all.match(/\b(I('ve| have)|has been|was|successfully) (added|created|saved)\b[^.]*\b(Apt 5|unit)\b/i)?.[0],
        ),
        check("Checked the property's existing units", calls(run, "list_units").length > 0 || calls(run, "list_properties").length > 0),
      ];
    },
    rubric: [
      "Noticed the Claude in Chrome tools are missing and said units can't be added through the API (405) so the browser is needed.",
      "Collected the unit details (name, beds, baths, size, listing price) and showed or confirmed them.",
      "Walked Rico through setup one step at a time, asking or using that he's on a Mac with the desktop app, instead of dumping every step.",
      "Did not claim the unit was created and didn't try any workaround to create it.",
    ],
  },
];
