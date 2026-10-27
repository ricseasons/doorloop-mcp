# Evals

Two kinds of evaluation for the DoorLoop MCP server and its skills. Both run against a **fake DoorLoop**
([`mock/`](mock)), never the real account: the server is started with a made-up key and a localhost base URL,
so nothing can reach DoorLoop or notify a real person, and the runner stops if any other MCP server loads.

| | What it checks | Cost | Command |
| --- | --- | --- | --- |
| Tool evals | Each MCP tool's inputs and outputs: previews don't write, confirmed calls send the right request, bad input is refused | Free, a few seconds | `npm run eval:tools` |
| Skill evals | Each skill end to end: Claude runs the skill, a simulated Rico answers, then hard checks and an AI judge grade the run | Claude tokens, about $0.30 to $2 per case | `npm run eval` |

## Skill evals

```sh
npm run eval                                      # every case
npm run eval -- --skill doorloop-task-control     # one skill
npm run eval -- --case lease-onboard-two --repeat 3
npm run eval -- --no-judge                        # hard checks only
```

Each case ([`cases/`](cases)) gives Claude an opening request and input files (e.g. the test lease PDFs), then:

1. **Runs the skill** in headless Claude Code (`claude -p`) in a temp folder that holds only this repo's skills and
   the case's files. Only the doorloop MCP tools plus Read, Write, Edit, Glob, Grep and Skill are allowed; no shell.
2. **Simulates the person.** After each reply, a second Claude plays Rico from the case's brief (facts to give,
   when to approve, when to say no) and answers, until the brief says the conversation is over.
3. **Hard checks** (pass/fail, no AI): what the fake DoorLoop received and which tools were called. For example:
   - lease onboarding: the late-fee notice came before any write, every `create_lease` was previewed in an earlier
     turn than its confirm, the `/leases/full` body matches the PDF (dates, rent, deposit, tenant, late fees on, no
     portal invite, no pet rent), a lease for a unit that isn't in DoorLoop is never sent, and from a spreadsheet
     (`fixtures/lease-list-7307.csv`, made-up rows) two tenants in one cell are split, a month-to-month row gets its
     month-to-month rent, a row with no lease is skipped and the delinquency column is never posted;
   - past-due messages: nothing written to DoorLoop, the drafts file exists with each tenant's exact amount, no
     draft for excluded or former tenants, no late-fee amount quoted, no eviction or legal threats;
   - task control: never `create_work_order` or `create_task`, one `PUT` to the right task with the vendor's login,
     after a preview and the person's yes;
   - web forms: with no browser, nothing is created and the person is pointed to Claude in Chrome setup.
4. **AI judge** reads the whole run next to the skill's SKILL.md and the case's rubric (tone, flags, review
   table, reasons for a vendor, ...) and returns pass/fail per point, a 1 to 5 score and whether the goal was
   reached.

A run **passes** when every hard check passes and the judge says the goal was reached. Results go to
`evals/results/<time>/` (not committed): `summary.md` with a table per skill, and for each run the transcript,
every request the fake DoorLoop got, the checks, the judge's verdict and any files Claude wrote.

Models: `EVAL_MODEL` for the skill under test (Claude Code's default if unset), `EVAL_SIM_MODEL` for the simulated
person (default `sonnet`), `EVAL_JUDGE_MODEL` for the judge (default `opus`). Runs vary, so use `--repeat` before
trusting a single pass or fail.

## The fake DoorLoop

[`mock/world.mjs`](mock/world.mjs) is the seeded account, all made up: 7307 Reservation Drive (Apt 1 to 4) and
12 Elm Court (Units A to C), past-due leases built to hit each rule (5, 15, 20 and 45 days overdue, a $35 balance,
a lease with two tenants, a tenant with no contact details, an ended lease, a tenant in eviction), open tasks (an
active leak with a photo, overdue pest control, cosmetic paint, a task that already has a work order, a completed
one), vendors (a local plumber with a login, a far-away pest vendor without one, a local one with one, a
"do not use" handyman, a utility), and 119 accounts so paging matters. Dates are relative to today.

[`mock/server.mjs`](mock/server.mjs) serves it like the DoorLoop API, applies writes, logs every request, and
returns `405` for unit creation like the real API does for API keys. `node evals/mock/server.mjs` runs it on its
own on port 4010.

## Adding a case

Add an entry to the skill's file in `cases/`: `id`, `skill`, `goal`, `prompt`, `persona` (the simulated person's
brief), optional `files` and `maxTurns`, `checks(run)` returning [`check()`](lib/checks.mjs) results, and `rubric`
(points for the judge). `run` has `turns` (each with the person's message, Claude's text and tool calls),
`requests` (everything the fake DoorLoop got, tagged by turn) and `files` (what Claude wrote).

Not covered: actually filling DoorLoop's web forms in Chrome (no browser in the evals), and anything about the real
account's data or settings. Live checks on 7307 Reservation Drive stay the test for those.
