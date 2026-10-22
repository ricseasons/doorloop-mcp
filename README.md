# DoorLoop MCP server

An [MCP](https://modelcontextprotocol.io) server over the [DoorLoop API](https://api.doorloop.com/reference/introduction),
so Claude skills and agents can read and (soon) write DoorLoop data.

It runs locally for now. A hosted connector version comes later and reuses the same client and tools.

## Your API key stays out of files

DoorLoop keys never expire, so the key is never put in this repo, a `.env` file, or a Claude config file.
The server looks for it in this order:

1. `DOORLOOP_API_KEY` in the environment. Claude Desktop sets this from its own secure storage when
   you install the `.mcpb` extension.
2. Your OS keychain (macOS Keychain, or GNOME Keyring/KWallet on Linux), under service `doorloop-mcp`.

Create a key in DoorLoop under **Settings > Zapier & API Keys** (Premium plan). Give it a role with only
the access the agent needs.

## Setup

```sh
npm install
npm run build
```

### Claude Desktop

```sh
npm run pack          # builds doorloop-mcp.mcpb
```

Double-click `doorloop-mcp.mcpb` (or drag it onto Claude Desktop's Settings > Extensions). It asks for
the API key and keeps it in secure storage.

### Claude Code

Store the key in your keychain once, then register the server. No key appears in the command or config.

```sh
npm run set-key
claude mcp add doorloop -- node "$(pwd)/dist/index.js"
```

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
| `list_vendors`, `get_vendor` | Vendors |
| `get_rent_roll` | Rent roll report with balances |
| `create_task` | Creates an internal task, or a subtask when given `parentTask`. Returns a preview unless `confirm` is true. |
| `create_work_order` | Creates a vendor work order as a subtask of a task, and can email the vendor. Returns a preview unless `confirm` is true. |
| `list_accounts` | Chart of accounts, e.g. to pick the account for a parking or pet charge |
| `create_lease` | Creates a lease with new or existing tenants, rent, security deposit and recurring charges in one transaction (official `POST /leases/full`). Rent and deposit use DoorLoop's default accounts unless given. Portal invite, welcome SMS and late fees are off unless asked. Returns a preview unless `confirm` is true. |
| `create_lease_charge` | Posts a one-time charge on a lease, e.g. a returned-check or cleaning fee (official `POST /lease-charges`). Accounts by id or name. Returns a preview with account names and the total unless `confirm` is true. |
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

## Open items (paused 2026-10-22)

- Create the test lease on 7307 Reservation Drive, Apt 2 from `test-fixtures/test-lease-7307-apt2.pdf`
  (preview done; waiting on Rico's go-ahead), then check it on the rent roll.
- Test `create_lease_charge` for real on that test lease (only previews so far).
- Use the `doorloop-web-forms` skill to actually save a unit once (forms mapped, nothing saved yet).
- Confirm the landlord name on the test lease: Speights LLC, or James Speights.
- Delete the test subtask `6ad99fdfa862267e62cdefa4` and work order `6ad9a13215c7a7215609a1cf` in DoorLoop.

## Roadmap

1. Past-due skill: list tenants with an `overdueBalance` and draft messages for review.
2. Task control skill: review open tasks, pick a vendor, create a subtask and work order.
