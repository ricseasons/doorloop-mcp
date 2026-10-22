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

## Roadmap

1. Lease onboarding skill: folder of leases in, reviewed table out. Units go in through Claude in Chrome
   (one unit at a time, or the new-property wizard for many); tenants and leases through the API.
2. Past-due skill: list tenants with an `overdueBalance` and draft messages for review.
3. Task control skill: review open tasks, pick a vendor, create a subtask and work order.
