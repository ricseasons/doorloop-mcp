---
name: doorloop-web-forms
description: Add units to a DoorLoop property, or create a new property with its units, by filling in the DoorLoop web app's forms with Claude in Chrome. Use when someone asks to add, create or set up units or a new property in DoorLoop. The DoorLoop API refuses these for API keys (405 Access Denied), so they go through the browser.
---

# DoorLoop web forms (Claude in Chrome)

DoorLoop's API can't create units or properties with an API key, so this skill fills in the web app's
own forms in the person's Chrome, using their existing DoorLoop login. Use the `doorloop` MCP tools for
everything else (looking up ids, checking results).

## Before you start

1. **Check the browser tools.** You need the Claude in Chrome tools (`mcp__claude-in-chrome__*`).
   If they're missing, or a call says the extension isn't connected, stop and walk the person through
   [SETUP.md](SETUP.md) one step at a time: give one step, wait for them to say it's done, then the next.
   Ask which they use (the Claude desktop app or Claude Code) and whether they're on a Mac or Windows,
   and only show the steps that apply.
2. **Check the DoorLoop login.** Open `https://app.doorloop.com/properties` in a new tab. DoorLoop
   redirects to the company's own address (for example `https://sp8sllc.app.doorloop.com/...`); use that
   address from then on. If you land on a login page, ask the person to log in in that tab. Never type
   their password, and stop for any CAPTCHA.
3. **Pick the route.**
   - 1–3 units on an existing property: **Add a unit** below, once per unit.
   - A new property: **New property with units** below. It takes many units in one form.
   - Many units for an existing property: there's no self-serve import in DoorLoop. Use **Add a unit**
     repeatedly (about 30–60 seconds each) and tell the person roughly how long it will take, or suggest
     asking DoorLoop support to import a spreadsheet.

Always collect the details first and show the person a short table of what you'll enter. Get their OK
before clicking **Save** or **Finish**. These create real records.

## Add a unit to an existing property

1. Find the property id with `list_properties` (match on name or street). Check the existing unit names
   with `list_units` (`filter_property`), so you don't create a duplicate.
2. Go to `https://<company>.app.doorloop.com/properties/<property id>/overview/units/new`. This opens the
   **Add new unit** form with the property already selected.
3. Fill in:
   - **Unit name** (required), e.g. `Apt 5`
   - **Listing price** (monthly market rent), **Size (sq. ft.)**, **Beds**, **Baths**
   - **Detailed description of this unit** (optional, up to 1000 characters)
   - Leave **Unit address is the same as property address** on, unless the unit has its own address.
   - Leave **This unit is active** checked.
   The **Photos** and **Rental application** sections on the left are optional; skip them unless asked.
4. Take a screenshot, show the person, and click **Save** after their OK.
5. Confirm with `list_units` (`filter_property`) that the new unit is there, and report its id.

## New property with units

The **New property** wizard is at `https://<company>.app.doorloop.com/properties/new` and has 5 steps.
Click **Next** after each one.

1. **Type**: pick **Residential** or **Commercial**, then the kind, e.g. **Single-Family**,
   **Multi-Family**, **Condo**, **Townhome** or **Other** (Other needs a property type typed in).
2. **Address**: **Street 1**, **Street 2**, **City**, **State** (pick the two-letter code from the list),
   **Zip code**, **Country** (pick from the list), **Time zone** (optional), and the **Federal affordable
   housing property** checkbox. DoorLoop checks the address. If it says it couldn't verify it, show the
   person; only click **Use this address anyway** if they confirm the address is right.
3. **Unit details**: one row per unit with **Unit name** (required), **Beds**, **Baths**,
   **Size (sq. ft.)** and **Listing price**, plus a **Unit address is the same as property address**
   switch. **Add another unit** adds a row. Each row's copy button duplicates it, which is quickest for
   many similar units: fill one, duplicate it, then change the name.
4. **Bank accounts**: **Use default account** is preselected; keep it unless the person names another.
5. **Ownership**: **Self-owned**, or **Assign owners** to pick owners who get portal access. Ask which.

Show the person a summary of every step, then click **Finish** after their OK. Confirm with
`list_properties` and `list_units` (`filter_property`) and report the new ids.

## Good habits

- Work in a new tab and close it when done.
- Read the page with `find` / `read_page` before clicking; take a screenshot before Save or Finish.
- If a click or field doesn't respond after 2–3 tries, stop and tell the person what happened.
- DoorLoop can change these forms. If a field or button named here is missing, describe what you see
  instead of guessing, and say this skill needs updating.
