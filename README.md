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

Read tools, plus one write tool that previews before it creates anything:

| Tool | What it does |
| --- | --- |
| `whoami` | Shows who owns the key. Run this first to check the connection. |
| `list_properties`, `get_property` | Properties |
| `list_units`, `get_unit` | Units, optionally by property |
| `list_tenants`, `get_tenant` | Tenants, with text search |
| `list_leases`, `get_lease` | Leases, optionally by property or unit |
| `get_rent_roll` | Rent roll report with balances |
| `create_property_with_units` | Creates a property and its units in one step. Returns a preview unless `confirm` is true. |
| `doorloop_get` | Any GET path, for exploring endpoints we haven't wrapped yet |

Requests are throttled to stay under DoorLoop's ~50 requests/minute limit, and 429s are retried.

## Undocumented endpoints

DoorLoop's public API can't create units. `create_property_with_units` uses
`POST /api/properties/create-property-wizard/`, the call the web app's New property wizard makes.
It isn't documented, so it may change, and we still need to confirm it accepts an API key rather
than only a browser login.

## Roadmap

1. Verify against a real account: unit creation, lease charges, and how past-due balances are exposed.
2. Write tools (property, unit, tenant, `leases/full`, rent charges) with a preview mode that shows the
   exact payload before anything is created.
3. Lease onboarding skill: folder of leases in, reviewed table, then records created.
4. Past-due skill: list late tenants and draft messages for review.
