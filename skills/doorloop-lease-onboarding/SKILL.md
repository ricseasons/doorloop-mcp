---
name: doorloop-lease-onboarding
description: Onboard existing leases into DoorLoop from a folder of lease documents (PDF, Word or scans). Reads each lease, builds one review table of units, tenants, dates, rent and deposits, flags gaps, then creates missing units (through Chrome), the leases with their tenants and rent (through the DoorLoop API), and any per-lease late fees (through Chrome) after the person's OK. Use when someone wants to load, import, onboard or set up leases, tenants or a rent roll in DoorLoop from documents.
---

# DoorLoop lease onboarding

Goal: a folder of signed leases in, the same leases set up in DoorLoop out, with nothing created until
the person has checked a review table.

Tools: the `doorloop` MCP server (`list_*`, `get_rent_roll`, `list_accounts`, `create_lease`) and, for
units that don't exist yet, the [doorloop-web-forms](../doorloop-web-forms/SKILL.md) skill.

**Late fees are chosen per lease.** Tell the person this at the start, in plain words: "For each lease
you'll pick whether DoorLoop charges late fees by its standard company settings or by the amounts written
in that lease." The API can only switch automatic late fees on; a lease's own amounts are set afterwards
in DoorLoop's web form through Chrome (doorloop-web-forms, **Set a lease's late fees**).

## 1. Ask for the inputs

- The folder with the lease files.
- The DoorLoop property they belong to. Find its id with `list_properties`. If the property doesn't exist
  yet, it's created later with the New property wizard (doorloop-web-forms), together with its units.
- Anything that applies to every lease, if they know it, e.g. "rent is due on the 1st" or "no deposits".

## 2. Read every lease

Open each file (use the pdf or docx skill for PDFs and Word files; read scans as images). For each lease,
pull out:

| Field | Notes |
| --- | --- |
| Unit | As written, e.g. "Apt 2", "Unit B" |
| Landlord | As named on the lease, to check it's the right owner or company |
| Tenants | First and last name of every adult on the lease. DoorLoop needs them split; if the split isn't obvious (one word, three words, a company), flag it and show the split you'd use |
| Tenant email / phone | Optional. Only what's in the document |
| Start date, end date | YYYY-MM-DD |
| Term | Fixed (has an end date) or AtWill (month-to-month) |
| Rolls to month-to-month | Whether the lease says it continues month-to-month after the end date |
| Monthly rent | Amount, and how often if not monthly |
| Rent due day | e.g. the 1st; sets the first rent date |
| Security deposit | Amount |
| Other recurring charges | Parking, pets, utilities, fees that apply every period: amount and how often |
| Late fee terms | Grace period and amount, as written |
| Conditional or one-off fees | Not charges yet, just notes: pet rent "if approved", cleaning fee on move-out, returned-check fee |
| Source | File name and page, so the person can check |

Don't guess. If something isn't in the document, leave it blank and flag it.

Only put a charge in **Other recurring charges** if the lease says the tenant pays it every period from
the start. A charge that depends on something ("$25/month pet rent once a pet is approved") goes in the
notes column and is flagged; ask whether it applies before adding it. Penalty fees (late, cleaning,
returned check) are never set up as charges here. Tell the person that when one actually applies, it
goes on the lease as a one-time charge with `create_lease_charge` (e.g. "charge Apt 2 a $25
returned-check fee").

## 3. Show one review table

One row per lease, the columns above, and a **Flags** column. Flag:

- missing required data (unit, a tenant name, start date, an end date on a fixed lease, rent);
- anything ambiguous or unreadable, with the exact wording;
- conflicts: two leases on one unit with overlapping dates, a date range that doesn't add up, rent that
  differs between pages;
- a unit not in DoorLoop yet (check with `list_units` and `filter_property`; match names loosely, e.g.
  "Apt 2" vs "Apartment 2", and say which match you'd use);
- a lease that may already exist (`list_leases` with `filter_property` / `filter_unit`, same dates) or a
  tenant that may already exist (`list_tenants` with `filter_text` on the name). Reuse an existing tenant's
  id rather than creating a duplicate.

Map each recurring charge to an income account with `list_accounts` (e.g. Parking, Pet Fees, Utility)
and show the account name in the table. Accounts come 100 per page, so read every page (`page_number`
2, 3, ...) before deciding none fits. Use a REVENUE account for a charge, not a LIABILITY one like
"Pet Deposit". If none fits, flag it and ask.

Late fees: every lease gets `automaticLateFees: true`. The API can't read DoorLoop's late-fee schedule
(405), so if Chrome is available, read it once (doorloop-web-forms skill): Settings > Company defaults >
**Fees** > **Late fees** tab (`/settings/general-settings/edit/online-payment-fees?fee=late-fees`).
In the review table, add a **Late fees** column that shows both, e.g. "Lease: $25 after 3 days + $5/day.
Company: $75 after 7 days, then $150 after 15 days", and ask the person, lease by lease, which to use:

- **Company settings**: nothing more to do after the lease is created.
- **Lease terms**: after the lease is created, set that lease's own late fees in DoorLoop's web form
  (step 5b). Turn the lease's clause into DoorLoop's terms first (grace days, a one-time fee, a daily
  fee, a cap) and show that translation. If the clause can't be expressed in DoorLoop's form (e.g. a
  percentage when the form only takes dollars), flag it and ask what to set.
- If the lease has no late-fee clause, say so and suggest company settings.

Don't pick for the person, and don't assume one answer covers every lease unless they say so ("use the
company settings for all of them"). A missing answer isn't a reason to hold a lease: create it, and
leave its late fees on the company settings until they decide. Only turn automatic late fees off for a
lease if the person explicitly asks.

Returned-payment fees: DoorLoop charges these automatically from the same Fees page (**Returned payment
fees** tab), so don't post them by hand with `create_lease_charge` for payments made through DoorLoop.
Flag it if the lease's amount differs from the company setting.

Ask the person to fix or confirm the flagged rows. Leases they don't confirm are skipped, not guessed.

## 4. Create missing units first

For units that don't exist, use doorloop-web-forms: the Add unit form for a few, or the New property
wizard if the property is new. List what you'll add and get an OK first. Re-run `list_units` afterwards
to get the new unit ids.

## 5. Create the leases

For each confirmed row, call `create_lease` **without** `confirm` first. It returns the exact request.
It creates the lease, any new tenants, the rent schedule, the deposit and the recurring charges in one
go; if any part fails, nothing is saved.

- `tenants`: existing tenant ids, or `{ firstName, lastName, email?, phone? }` for new ones.
- `rent.start`: the first due date on or after the lease start (this sets the due day). Leave out to use
  the lease start.
- `securityDeposit.date`: when it was charged; defaults to the lease start.
- Set `automaticLateFees: true` (see Late fees above).
- Leave `residentPortalAccess` and `sendWelcomeSms` off unless the person asks.
  Turning on the portal invites tenants by email, so ask first and say who would get one.

You can show several previews together, as a short list (unit, tenants, dates, rent, deposit, charges).
Then stop and wait: an OK on the review table is not an OK to create. Never preview and confirm in the same
reply. Once the person says yes to the previews, call each one again with `confirm: true`, one at a time. If one fails, report
the error and carry on with the rest only if the person agrees.

Dates in the past: DoorLoop will post rent charges from the start date, so an old lease creates a
balance for every month since it started. Point this out before confirming a lease that started more
than a month ago, and ask whether to start rent from the current month instead (`rent.start`).

## 5b. Set per-lease late fees

For each created lease where the person chose **Lease terms**, use doorloop-web-forms, **Set a lease's
late fees**, with the lease id from step 5. Show the amounts you'll enter for all of them as one list,
and get a yes before saving; a yes on the leases is not a yes on the late fees. Without Chrome, list the
leases and amounts still to set by hand and say where (the lease's late-fee settings in DoorLoop).

## 6. Check and report

Run `get_rent_roll` with `filter_property` and compare it with the table: each unit's lease, rent and
deposit. Then report:

- leases created (lease id, unit, tenants) and tenants created;
- units added through Chrome;
- late fees per lease: company settings, or the custom amounts set (and any still to set by hand);
- rows skipped and why;
- anything that doesn't match the documents.
