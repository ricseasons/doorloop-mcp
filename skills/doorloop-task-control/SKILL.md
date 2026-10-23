---
name: doorloop-task-control
description: Review open DoorLoop tasks, rank them by severity, propose the right vendor, and after the person confirms create a subtask plus a vendor work order with vendor, owner and tenant notifications. Use when someone wants to triage, review or catch up on open, overdue, unassigned or not-started maintenance tasks, or dispatch a vendor.
---

# DoorLoop task control

Goal: find the tasks that need attention, agree on the most serious ones with the person, and dispatch a
vendor for each. Nothing is created and nobody is notified until the person says yes to a preview.

Tools: the `doorloop` MCP server (`list_tasks`, `get_task`, `list_task_children`, `get_task_files`,
`list_vendors`, `get_vendor`, `list_properties`, `get_unit`, `get_tenant`, `create_task`,
`create_work_order`).

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

## 5. Preview, then create

Once the vendor is confirmed, prepare two records, both linked to the task being worked:

1. A **subtask** with `create_task` (`parentTask` = the task id): an internal follow-up such as
   "Follow up with <vendor> on <subject>", due a day or two after the work order's due date.
2. A **work order** with `create_work_order` (`task` = the task id, `vendor` = the vendor id), with the subject,
   a description written for the vendor (what's wrong, where, access notes), priority from the severity
   level (1 → HIGH, 2 → HIGH, 3 → MEDIUM, 4 → LOW), a due date, and
   `notifyVendor=true`, `notifyOwners=true`, `notifyTenants=true`.

Call both without `confirm` first and show the person the previews in plain words: who gets notified (the
vendor, the property's owners, and the unit's tenants by name), the vendor email text, and the due dates.
Only after an explicit yes, call both again with `confirm=true`, then `get_task` to confirm they exist and
report the links.

If the task has no unit or tenant, say that the tenant notification will reach no one. Never turn on
notifications for a test property or test task unless the person asks.

## 6. Next task

Go back to step 3 for the next task on the list until the person stops. End with a summary of what was
dispatched and what is still open.
