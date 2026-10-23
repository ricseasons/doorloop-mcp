---
name: doorloop-task-control
description: Review open DoorLoop tasks, rank them by severity, discuss the high-priority ones, recommend a vendor, and after the person confirms assign the task. Does not create work orders (the vendor does). Use when someone wants to triage, review or catch up on open, overdue, unassigned or not-started maintenance tasks.
---

# DoorLoop task control

Goal: find the tasks that need attention, agree on the most serious ones with the person, recommend a
vendor, and assign each confirmed task. Nothing changes and nobody is notified until the person says yes
to a preview.

Tools: the `doorloop` MCP server (`list_tasks`, `get_task`, `list_task_children`, `get_task_files`,
`list_vendors`, `get_vendor`, `list_users`, `list_properties`, `get_unit`, `get_tenant`, `assign_task`).
`create_task` and `create_work_order` exist on the server but are **not used by this skill**.

Task fields (as DoorLoop returns them): `subject`, `description`, `type` (`TENANT_REQUEST`,
`INTERNAL_TASK`, `WORK_ORDER`), `status` (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`), `priority`
(`LOW`, `MEDIUM`, `HIGH`), `dueDate` (often missing), `property`, `unit`, `requestedByTenant`,
`assignedToUsers`, `entryPermission` and `entryNotes`, `tenantRequestType` (`MAINTENANCE`, `GENERAL`),
`aiSummaryTitle` / `aiSummaryContent` (DoorLoop's own summary, when present), and `linkedResource` (for a
subtask or work order, the parent task). A work order also has `workOrder.assignedToVendor`.

## 1. Collect the open tasks

- `list_tasks` with `filter_status=NOT_STARTED` (page through all), plus overdue ones: `list_tasks` with
  `filter_dueDate_to` = yesterday, keeping the ones whose status isn't `COMPLETED`.
- Drop `WORK_ORDER` and any task whose `linkedResource.resourceType` is `TASK`; those are children of a
  task, not tasks to triage.
- For each remaining task, `list_task_children` shows its subtasks and work orders. A task counts as
  **unassigned** when no open work order under it has a vendor. Mention existing open work orders: don't
  dispatch the same job twice.
- If the person names a property, filter to it (`filter_property`).

## 2. Rank by severity

Read each task's subject, description (and `aiSummaryContent`), type, priority, property and unit, and
look at its pictures with `get_task_files` (tenant photos are files attached to the task; it returns up to
4 images). Give each task a level:

| Level | Examples |
| --- | --- |
| 1 Emergency | Active water leak or flooding, fire or smoke damage, gas smell, no heat in freezing weather, sewage backup, electrical hazard, broken exterior door or lock, anything unsafe |
| 2 Urgent | No hot water, AC out in heat, a broken fridge or stove, pests, a toilet that won't flush (only one in the unit), roof leak without active damage |
| 3 Routine | Slow drains, appliance faults with a workaround, minor leaks under a sink, doors or windows that stick |
| 4 Cosmetic | Paint, scuffs, caulking, landscaping, anything that can wait for turnover |

Within a level, sort by days overdue, then unassigned before assigned, then occupied units (a tenant is
affected) before vacant ones. If the pictures show something worse than the text says, go with the pictures
and say so. If you can't tell, say what you'd need to know rather than guessing.

## 3. Show the list and discuss the top tasks

Show one table: level, task subject, property and unit, status, due date (and days overdue), assigned or not,
and a one-line reason for the level. Then walk through the most serious tasks one at a time, starting at the
top, and let the person reorder, skip, or change a level.

## 4. Propose a vendor

For the task being discussed, `list_vendors` (page through all) and score candidates in this order:

1. Serves the task's property: the task's `property` id is in the vendor's `properties` list. (Only some
   vendors have properties set, so a vendor without any isn't ruled out.)
2. `notes` that fit the job (trade, specialties, "emergency calls", "preferred for X", "do not use").
3. `name` / `companyName` / `jobTitle` and `services` that point at the trade (e.g. "Pest Control",
   "Plumbing", "Heating & Air").
4. Location: the vendor's `primaryAddress` city and state against the property's.
5. Past work: `list_tasks` with `filter_type=WORK_ORDER`, then match
   `workOrder.assignedToVendor` (DoorLoop ignores a vendor filter there) on the same property or the same
   kind of problem.

If none of the candidates is in the property's state, say so plainly ("no pest vendor near Springfield,
VA; closest is in Olive Branch, MS") so the person can decide whether to add a local vendor first.

Skip vendors with `active: false` and those whose notes say not to use them. Utilities, lenders and other
non-trade payees in the vendor list are never candidates. Propose one vendor with the reasons, plus up to
two backups. The person confirms or picks another.

## 5. Confirm, then assign

This skill **does not create work orders or subtasks**: the vendor gets the task and creates the work order
themselves. Vendors who do this have their own DoorLoop login, and the task is assigned to that login.

1. Check the recommended vendor has a login: `list_vendor_users` (vendor id → user id). If it doesn't, say
   so ("Action Pest Control has no DoorLoop login") and offer the next candidate that has one, or a team
   user from `list_users`. Never guess a vendor's login from emails or names; vendors share company emails.
2. Call `assign_task` with `vendor` = the vendor id (it looks up the login) and without `confirm`. Show the
   change (current assignees → the vendor's login) and who will be notified. Everyone is notified by
   default: the assignee (the vendor), the property's owners and the unit's tenants, by name. Say when a
   group reaches no one (no owners on the property, no tenant on the unit).
3. Only after the person's explicit yes, call it again with `confirm=true`, then `get_task` to check
   `assignedToUsers` and report it.

Never assign a test task with notifications on unless the person asks.

## 6. Next task

Go back to step 3 for the next task on the list until the person stops. End with a summary: which tasks
were assigned to whom, the vendor recommended for each, and what is still open.
