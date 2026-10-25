# DoorLoop MCP server

An [MCP](https://modelcontextprotocol.io) server over the [DoorLoop API](https://api.doorloop.com/reference/introduction),
so Claude skills and agents can read and (soon) write DoorLoop data.

It runs locally for now. A hosted connector version comes later and reuses the same client and tools.

## Your API key stays out of files

DoorLoop keys never expire, so the key is never put in this repo, a `.env` file, or a Claude config file.
The server looks for it in this order:

1. `DOORLOOP_API_KEY` in the environment. Claude Desktop sets this from its own secure storage when
   you install the `.mcpb` extension.
2. Your OS keychain (macOS Keychain, Windows Credential Manager, or GNOME Keyring/KWallet on Linux),
   under service `doorloop-mcp`.

Create a key in DoorLoop under **Settings > Zapier & API Keys** (included in DoorLoop's base plan). Give it a role with only
the access the agent needs.

## Setup

Works on a Mac or Windows PC (and Linux). You need a GitHub account with access to this private repo (ask
Rico), a DoorLoop API key, and Claude Code: the terminal app, or the **Code** tab in the Claude desktop app.
To install Claude Code, see [code.claude.com](https://code.claude.com/docs/en/setup).

**Let Claude do it.** Open Claude Code in any folder and paste:

> Install the DoorLoop tools for me: clone github.com/ricseasons/doorloop-mcp and follow its
> INSTALL-AGENT.md.

Claude checks for Node.js and Git, installs what's missing, and runs the setup. It only asks you for the
things it can't do: sign in to GitHub, type your DoorLoop API key into a hidden prompt in your own terminal
window, approve any admin prompt, upload the skills in Claude Desktop, and set up Claude in Chrome.
[INSTALL-AGENT.md](INSTALL-AGENT.md) has the steps it follows.

To update later, paste: "Update my DoorLoop tools (doorloop-mcp) to the latest version."

**Or by hand.** With Node.js 20+ and Git installed, in the doorloop-mcp folder:

```sh
npm run set-key   # once: paste your API key (hidden) into the Mac Keychain or Windows Credential Manager
npm run setup
```

Setup installs and builds, checks the key against DoorLoop, registers the server with Claude Code and with
Claude Desktop (whichever are installed), links the skills into `~/.claude/skills` so updates reach them,
and zips each skill into `skill-zips/` for uploading in Claude Desktop. It's safe to run again;
`npm run update` pulls the latest code and reruns it. At the end it lists what's left by hand: uploading
the skill zips in Claude Desktop, Claude in Chrome for adding units, and signing in to DoorLoop in Chrome.

**Claude Desktop extension instead.** `npm run pack` builds `doorloop-mcp.mcpb`; double-click it (or drag it
onto Claude Desktop's Settings > Extensions). It asks for the API key and keeps it in its own secure
storage. Setup notices the extension and doesn't add a second copy.

## Tools

Read tools, plus write tools that preview before they create anything:

| Tool | What it does |
| --- | --- |
| `whoami` | Shows who owns the key. Run this first to check the connection. |
| `list_properties`, `get_property` | Properties |
| `list_units`, `get_unit` | Units, optionally by property |
| `list_tenants`, `get_tenant` | Tenants, with text search |
| `list_leases`, `get_lease` | Leases, optionally by property or unit |
| `list_tasks`, `get_task` | Tasks and work orders, by status or property |
| `list_task_children` | A task's subtasks and work orders |
| `get_task_files` | Files attached to a task, with its photos returned as images |
| `list_vendors`, `get_vendor` | Vendors |
| `get_rent_roll` | Rent roll report with balances |
| `list_past_due_leases` | Leases with an `overdueBalance`, largest first, with property, unit and tenant names, emails and phones |
| `create_task` | Creates an internal task, or a subtask when given `parentTask`. Returns a preview unless `confirm` is true. |
| `create_work_order` | Creates a vendor work order as a subtask of a task, and can email the vendor. Returns a preview unless `confirm` is true. Not used by the skills: in Rico's process the vendor creates the work order. |
| `assign_task` | Assigns an existing task to a vendor's DoorLoop login (by vendor id) or to team users (`PUT /tasks/{id}`), with assignee, owner and tenant notifications on by default. Returns a preview unless `confirm` is true. |
| `list_users` | DoorLoop users on the team |
| `list_vendor_users` | Which vendors have a DoorLoop login, from [`vendor-users.json`](vendor-users.json) |

Vendors who work tasks have their own DoorLoop login. `vendor-users.json` maps each vendor id to that
vendor's user id; it's kept by hand because vendors share company emails, so automatic matching isn't
reliable. Set `DOORLOOP_VENDOR_USERS` to use a file elsewhere.
| `list_accounts` | Chart of accounts, e.g. to pick the account for a parking or pet charge. Search by `name` (loose) and `class`; returns short rows (id, name, class, active) across every page |
| `create_lease` | Creates a lease with new or existing tenants, rent, security deposit and recurring charges in one transaction (official `POST /leases/full`). Rent and deposit use DoorLoop's default accounts unless given. Portal invite, welcome SMS and late fees are off unless asked. Returns a preview unless `confirm` is true. |
| `create_lease_charge` | Posts a one-time charge on a lease, e.g. a returned-check or cleaning fee (official `POST /lease-charges`). Accounts by id or name; names match loosely (case, plurals, partial words), and when several accounts match it lists them so Claude asks which one. Returns a preview with account names and the total unless `confirm` is true. |
| `doorloop_get` | Any GET path, for exploring endpoints we haven't wrapped yet |

Requests are throttled to stay under DoorLoop's ~50 requests/minute limit, and 429s are retried.

## Undocumented endpoints

DoorLoop's public API docs don't cover subtasks or work orders, so these tools send the same requests as
the web app's forms, to the official `POST /api/tasks/` endpoint:

- `create_task`: `POST /api/tasks/` with `type: INTERNAL_TASK` (new task / subtask form)
- `create_work_order`: `POST /api/tasks/` with `type: WORK_ORDER` (a task's New work order form)

Both were tested with an API key on 2026-10-22 and work. The extra fields aren't documented, so they may
change.

**Units can't be created with an API key.** The web app's `POST /api/units/` and
`POST /api/properties/create-property-wizard/` return `405 Access Denied` for API keys. The
[`doorloop-web-forms` skill](skills/doorloop-web-forms/SKILL.md) adds units and new properties through
the web app's forms with Claude in Chrome. DoorLoop has no self-serve unit import; for a large batch,
ask DoorLoop support to import a spreadsheet.

Setting up Claude in Chrome (Mac and Windows) is covered step by step in
[skills/doorloop-web-forms/SETUP.md](skills/doorloop-web-forms/SETUP.md).

## Skills

- [`doorloop-lease-onboarding`](skills/doorloop-lease-onboarding/SKILL.md): folder of lease documents in,
  review table, then units through Chrome and leases with tenants and rent through `create_lease`.
  Conditional fees (cleaning, returned check, pet rent once approved) aren't set up as recurring
  charges; they're posted when they apply with `create_lease_charge`.

**Late fees follow DoorLoop's settings.** Leases created by the onboarding skill have automatic late fees
on, and DoorLoop charges them by its own late-fee schedule (Settings > Company defaults > Fees > Late
fees), not by the amounts written in the lease. The API can't set per-lease late-fee amounts.
- [`doorloop-web-forms`](skills/doorloop-web-forms/SKILL.md): add units or a new property with Claude in
  Chrome.
- [`doorloop-past-due-messages`](skills/doorloop-past-due-messages/SKILL.md): finds tenants with an overdue
  balance and drafts a message to each for review. It only drafts; nothing is sent to tenants.

## Evals

[`evals/`](evals/README.md) tests the tools and skills against a fake DoorLoop, never the real account.
`npm run eval:tools` checks each tool's requests and results (free, a few seconds). `npm run eval` runs each
skill end to end in headless Claude with a simulated person, then grades it with hard checks (e.g. nothing
written without a preview and a yes, no work orders, drafts never sent) and an AI judge. It costs Claude tokens.

## Open items (paused 2026-10-22)

- Create the test lease on 7307 Reservation Drive, Apt 2 from `test-fixtures/test-lease-7307-apt2.pdf`
  (preview done; waiting on Rico's go-ahead), then check it on the rent roll.
- Test `create_lease_charge` for real on that test lease (only previews so far).
- Use the `doorloop-web-forms` skill to actually save a unit once (forms mapped, nothing saved yet).
- Confirm the landlord name on the test lease: Speights LLC, or James Speights.
- Delete the test subtask `6ad99fdfa862267e62cdefa4` and work order `6ad9a13215c7a7215609a1cf` in DoorLoop.
  They sit under a real tenant request ("Pest Control Needed", 444 North Central Avenue #108), not a test
  task. Future task tests use the 7307 Reservation Drive task "Pest Control" (`6ad9736b315f38741ee8102f`).
- Delete the test unit "API Test Unit" on 7307 Reservation Drive (`6adaef1812eb6d62b9152a71`, added
  2026-10-23 through Claude in Chrome) when done.
- Delete the task control test records under that 7307 task when done: subtask `6adadedc7eb2a1d131e9521b`,
  work order `6adadede89ebd97822a3f534` (created 2026-10-23, notifications off).

## Roadmap

1. Done: past-due skill (`doorloop-past-due-messages`), drafts only.
2. Task control skill: review open tasks, pick a vendor, create a subtask and work order.
