---
name: doorloop-past-due-messages
description: Find DoorLoop tenants with past-due balances and draft a message to each one for the person to review and send themselves. Drafts only, never sends. Use when someone wants to follow up on late rent, chase overdue balances, see who owes money, or write past-due, late-rent or payment reminder messages.
---

# DoorLoop past-due messages

Goal: a list of every lease with an overdue balance, and a ready-to-send draft for each tenant, that the
person reviews, edits and sends themselves.

**This skill never sends anything.** It doesn't email, text, post to the tenant portal or create
announcements, and it doesn't add charges, notes or tasks in DoorLoop. It only reads DoorLoop and writes
drafts. If the person asks you to send the messages, say the skill only drafts and they send them from
DoorLoop or their own email or phone.

Tools: the `doorloop` MCP server (`list_past_due_leases`, `list_properties`, `get_lease`, and
`doorloop_get` for the charge detail). All read-only.

## 1. Ask for the scope

- All properties, or one (find its id with `list_properties`).
- Who signs the messages and how tenants reach them (name or company, phone, payment link or portal). Don't
  invent contact details or a payment method; leave a `[placeholder]` if they don't say.
- Anything to leave out: tenants on a payment plan, an eviction in progress, a dispute. Never draft for a
  tenant the person says is in an eviction or legal process unless they ask; those messages should come
  from their attorney.

## 2. Find who is past due

Call `list_past_due_leases` (with `filter_property` if one property). It returns each lease with an
`overdueBalance` above zero, largest first, with its property, unit, and the tenants' names, emails and
phones. `overdueBalance` is what is past its due date; `totalBalanceDue` also counts charges not due yet.
Use `overdueBalance` in messages.

For each lease, find how long it has been overdue: `doorloop_get` on `/lease-charges` with
`filter_lease=<lease id>` and look for the oldest charge that's still open (its due `date` and
outstanding amount). If the charge data isn't clear, say "past due" without a day count rather than
guessing.

Skip leases that are inactive or ended unless the person wants former tenants included (those messages
are about a final balance, not rent).

## 3. Show the list

One table, before any drafts: property and unit, tenants, overdue balance, oldest unpaid charge and its
date (days overdue), contact on file (email / phone / none), and the tone you'd use (below). Add the total
overdue at the bottom. Flag:

- tenants with no email or phone (the person will need another way to reach them);
- a balance under one week's rent that may be a timing issue (a payment in flight);
- a lease with several tenants (one message to all of them, or one each; ask).

Let the person drop rows, change the tone, or add notes ("he called and said Friday") before drafting.

## 4. Pick the tone

| Days overdue | Tone |
| --- | --- |
| 1 to 10 | Friendly reminder. Assume it slipped their mind. |
| 11 to 30 | Firm. State the amount, ask for payment or a call by a date. |
| Over 30, or more than one month's rent | Serious. Ask them to pay or set up a plan by a date, and say the balance keeps growing. |

The person's choice beats the table. Whatever the tone:

- Use the exact amount from DoorLoop and the unit address. Don't round.
- **Late fees follow DoorLoop's late-fee settings.** Don't quote a late-fee amount or say one will be added
  unless the person confirms it; just say late fees may apply under the lease.
- No threats of eviction, legal action, credit reporting or utility shut-off unless the person asks for it
  and it's true. Never shame, never mention other tenants, never contact anyone other than the tenants on the
  lease.
- Offer a way out: pay now, or reply to talk about a payment plan.
- Plain, short sentences. Address tenants by first name.

## 5. Draft the messages

For each lease, write:

- **Text (SMS)**: under 320 characters, with the amount and how to pay or reply.
- **Email**: a subject line and a short body (under 150 words).

Example (friendly, 5 days):

> Text: Hi Maria, this is Speights LLC. Our records show $850.00 past due for 7307 Reservation Drive, Apt 2.
> Please pay through your tenant portal, or reply if you have any questions. Thank you!

Put all drafts in one Markdown file the person can review, in the folder they choose (or the project's
files), named `past-due-drafts-YYYY-MM-DD.md`, with the table from step 3 at the top and the drafts in the
same order. Show a short summary in chat and point to the file. Include the tenant's email and phone next to
each draft so it's easy to send, and mark drafts for tenants with no contact on file.

## 6. Revise

Take edits ("make Apt 4 softer", "add that the office is closed Monday") and update the file. When the
person is done, end with: how many drafts, the total overdue, and anyone left out and why. Remind them the
messages haven't been sent.

## Testing

Live tests use 7307 Reservation Drive only (`filter_property` set to its id). Drafts for test tenants go in
the same file format; nothing goes to real tenants.
