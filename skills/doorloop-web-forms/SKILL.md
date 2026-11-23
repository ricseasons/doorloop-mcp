---
name: doorloop-web-forms
description: Add units to a DoorLoop property, create a new property with its units, or give one lease its own late fees. Units and properties go through the saved DoorLoop web login (create_unit, create_property_with_units) when there is one, otherwise through the web app's forms with Claude in Chrome; late fees always use Chrome. Use when someone asks to add, create or set up units or a new property in DoorLoop, or to change, customize or read a lease's late fees. The DoorLoop API can't do these with an API key.
---

# DoorLoop web forms (Claude in Chrome)

DoorLoop's API can't create units or properties with an API key, and can only switch a lease's
automatic late fees on or off (not set amounts), so this skill fills in the web app's own forms in the person's Chrome, using their existing DoorLoop login. Use the `doorloop` MCP tools for
everything else (looking up ids, checking results).

## Units and properties with the web login (try this first)

Call `web_login_status`. If `saved` is true and `expired` isn't true, skip Chrome for units and properties:

1. Find the property with `list_properties` and its existing units with `list_units` (`filter_property`), so
   you don't create a duplicate. Match names loosely ("Apt 5" and "Apartment 5" are the same unit).
2. Collect the details: unit name (required), beds, baths, size (sq. ft.), listing price; a unit address only
   if it differs from the property's. For a new property: street, city, two-letter state, zip, and every unit.
3. Call `create_unit` (or `create_property_with_units`) **without** `confirm`. Show the person a short table of
   what it will create and get their OK. Only then call it again with the same details and `confirm: true`.
   Call it once per unit; never retry a confirmed call without checking `list_units` first.
4. Confirm with `list_units` (`filter_property`) and report the new ids.

`create_property_with_units` makes a self-owned property with DoorLoop's default bank account. If the person
wants owners assigned or another bank account, or a property type other than residential multi-family, use
the **New property with units** form below instead.

If a call says the web login expired or none is saved, ask the person to run `npm run web-login` in the
doorloop-mcp folder (it walks them through copying one request from Chrome's DevTools; they never paste the
login to you). Then try again, or use Chrome below if they'd rather not. Never ask for a token, cookie or
header value, and never accept one pasted into chat: tell them to run `npm run web-login` instead.

## Before you start (Chrome)

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
   - A lease's own late fees, or reading the company late-fee schedule: **Late fees** below.
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
5. After Save, DoorLoop may jump to the Overview page instead of the property; that's normal. Confirm
   with `list_units` (`filter_property`) that the new unit is there, and report its id. Click Save only
   once; if nothing seems to happen, check `list_units` before trying again so you don't make a duplicate.

Tested 2026-10-23: "API Test Unit" on 7307 Reservation Drive (unit `6adaef1812eb6d62b9152a71`).

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

## Late fees

All late-fee settings live under Settings, not on the lease's own pages (the lease's Settings tab and
**Manage lease** > **Edit** have no late-fee fields).

### Read the company schedule

Go to `https://<company>.app.doorloop.com/settings/general-settings/edit/online-payment-fees?fee=late-fees`
(Settings > Company defaults > **Fees** > **Late fees** tab; the address says online-payment-fees even on
this tab). Read, don't change:

- **Late fee schedule**: one card per fee, applied in order. Each has **Fee type** (Flat fee ($) or
  Percentage (%)), **Fee ($)**, **Frequency** (Once, Daily, Weekly, Monthly), **Grace period (days)**,
  **Revenue account** and **Description**. A card's header sums it up, e.g. "1 · $75.00 · ONCE · 1st Late Fee".
- **Fee limitations & restrictions**: toggles for **Maximum daily fees**, **Maximum monthly fees**,
  **Minimum balance to apply fees**, **Apply only to the most recent charge**, and **Apply only on
  specific outstanding charges** (with **Charges to consider** and **Accounts**, e.g. Rent only).
- **Late fee reminders**: channels (Email, SMS, Push notifications) before and after a fee is charged.

Summarize it in one line per fee, e.g. "$75 once after 7 days grace, then $150 once after 15 days, rent
only". Company settings change every lease that isn't customized, so never edit this page unless the
person explicitly asks for a company-wide change.

### Set a lease's late fees

1. From the company Late fees tab, click **Customize** (in the "Customize by property & lease" card).
   This opens "Late fees · Properties"; switch to the **Leases** tab
   (`/settings/general-settings/edit/online-payment-fees/overrides/leases?fee=late-fees`).
2. Find the lease with **Search leases...** (property and unit, or tenant name). The **Customization**
   column says **Company default** or **Customized**. Click the row; a drawer opens titled
   "Late fees · <property> > <unit>". It has no address of its own.
3. The drawer starts as a copy of the company settings (or the lease's current custom ones). Change it to
   match what the person approved:
   - Keep **Automatic late fees** on. Turning it off stops all late fees on this lease; only do that if
     asked.
   - **Late fee schedule**: edit each card's **Fee type**, **Fee ($)**, **Frequency**, **Grace period
     (days)**, **Revenue account** (normally **Late Fees**) and **Description**. Use **+ Add late fee**
     for another fee, and a card's ⋮ menu > **Delete** to remove one. Translate lease wording like this:
     "$50 if rent is paid after the 5th" → Flat, $50, Once, grace 4 days if rent is due on the 1st
     (grace days count from the due date; check it in the Simulation and tell the person which you used); "$10 per day after that" → a second card, Flat, $10, Daily, same
     grace; "5% of rent" → Percentage.
   - **Fee limitations & restrictions**: a cap in the lease ("late fees won't exceed $200 a month") →
     **Maximum monthly fees** on, with the amount. Leave the other toggles as they are unless the lease says
     otherwise.
   - Leave **Late fee reminders** as they are unless asked.
4. The **Simulation** at the bottom shows what a sample late payment would be charged. Use **Edit inputs**
   to try the lease's rent and a delinquency past the last grace period, and check the result matches the
   lease.
5. Take a screenshot of the schedule and the simulation, show the person, and click **Save** (bottom of
   the drawer; it stays greyed out until something changes) only after their yes. **Cancel** or the × closes
   without saving.
6. Check that the lease's **Customization** now says **Customized**, reopen the drawer, and confirm the
   values stuck. Report the lease, the fees set, and that it now overrides the company settings.

Not mapped yet (describe what you see the first time, and say this skill needs updating): a way to put a
customized lease back on the company default, the amount boxes behind the limitation toggles, and the
Properties tab of the same Customize page, which sets a property's own late fees.

## Good habits

- Work in a new tab and close it when done.
- Read the page with `find` / `read_page` before clicking; take a screenshot before Save or Finish.
- DoorLoop shows popups (product surveys, "how likely are you to recommend" ratings) that can cover the
  form. Close them with their X without answering; never fill in or submit them.
- If a click or field doesn't respond after 2–3 tries, stop and tell the person what happened.
- DoorLoop can change these forms. If a field or button named here is missing, describe what you see
  instead of guessing, and say this skill needs updating.
