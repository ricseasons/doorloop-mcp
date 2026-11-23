import { calls, check, noWrites, previewedFirst } from "../lib/checks.mjs";

// The evals have no browser. With no web login saved, the skill has to say what's needed (npm run web-login
// or Claude in Chrome) instead of faking the unit some other way. With one saved, it previews, waits for a yes
// and creates the unit once.
export default [
  {
    id: "webforms-no-chrome",
    skill: "doorloop-web-forms",
    goal:
      "With no saved web login and no Claude in Chrome tools, the assistant doesn't create or pretend to create the unit; it explains that npm run web-login or Chrome is needed and starts the setup one step at a time.",
    prompt: "Add a unit called Apt 5 to 7307 Reservation Drive: 2 beds, 1 bath, 850 sq ft, listing price $1,250.",
    persona: `You are Rico. You want a new unit Apt 5 on 7307 Reservation Drive. Facts, if asked: you're on a Mac and use
the Claude desktop app. If the assistant gives you a setup step, say "I'll do the Chrome setup later, thanks." Then the
conversation is over.`,
    maxTurns: 3,
    checks: (run) => {
      const all = run.turns.map((t) => t.text).join("\n");
      return [
        noWrites(run),
        check("Said the web login or Claude in Chrome is needed", /web-login|Claude in Chrome|Chrome extension|browser extension/i.test(all)),
        check(
          "Never claimed the unit was added",
          !/\b(I('ve| have)|has been|was|successfully) (added|created|saved)\b[^.]*\b(Apt 5|unit)\b/i.test(all),
          all.match(/\b(I('ve| have)|has been|was|successfully) (added|created|saved)\b[^.]*\b(Apt 5|unit)\b/i)?.[0],
        ),
        check("Checked the property's existing units", calls(run, "list_units").length > 0 || calls(run, "list_properties").length > 0),
      ];
    },
    rubric: [
      "Checked web_login_status, and with none saved said Rico can run npm run web-login, or that the browser is needed since the Claude in Chrome tools are missing.",
      "Collected the unit details (name, beds, baths, size, listing price) and showed or confirmed them.",
      "Walked Rico through setup one step at a time, asking or using that he's on a Mac with the desktop app, instead of dumping every step.",
      "Did not claim the unit was created and didn't try any workaround to create it.",
    ],
  },
  {
    id: "webforms-web-login",
    skill: "doorloop-web-forms",
    webLogin: "ok",
    goal: "With a saved web login, the assistant previews Apt 5 with create_unit, gets Rico's yes, creates it once and reports its id.",
    prompt: "Add a unit called Apt 5 to 7307 Reservation Drive: 2 beds, 1 bath, 850 sq ft, listing price $1,250.",
    persona: `You are Rico. You want a new unit Apt 5 on 7307 Reservation Drive. When the assistant shows you what it will
create and asks, say "yes, go ahead". After it reports the unit was added, the conversation is over.`,
    maxTurns: 3,
    checks: (run) => {
      const posts = run.requests.filter((r) => r.method === "POST" && r.path === "/units");
      return [
        previewedFirst(run, "create_unit"),
        check("Created exactly one unit", posts.length === 1, `${posts.length} POST /units`),
        check(
          "With the details Rico gave",
          posts.length === 1 && posts[0].body.name === "Apt 5" && posts[0].body.beds === 2 && posts[0].body.baths === 1 &&
            posts[0].body.size === 850 && posts[0].body.marketRent === 1250,
          JSON.stringify(posts[0]?.body ?? {}),
        ),
        check("Never created a work order", calls(run, "create_work_order").length === 0),
      ];
    },
    rubric: [
      "Checked the property's existing units before creating one.",
      "Showed a short summary of the unit before creating it and waited for Rico's yes.",
      "Reported the new unit and its id after checking it was there.",
      "Never asked Rico for a token, cookie or password.",
    ],
  },
];
