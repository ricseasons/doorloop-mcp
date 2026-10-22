---
name: doorloop-task-control
description: Review open DoorLoop tasks, rank them by severity, propose the right vendor, and after the person confirms create a subtask plus a vendor work order with vendor, owner and tenant notifications. Use when someone wants to triage, review or catch up on open, overdue, unassigned or not-started maintenance tasks, or dispatch a vendor.
---

# DoorLoop task control

Goal: find the tasks that need attention, agree on the most serious ones with the person, and dispatch a
vendor for each. Nothing is created and nobody is notified until the person says yes to a preview.

Tools: the `doorloop` MCP server (`list_tasks`, `get_task`, `list_vendors`, `get_vendor`, `list_properties`,
`get_unit`, `get_tenant`, `create_task`, `create_work_order`).

## 1. Collect the open tasks

- `list_tasks` with `filter_status=NOT_STARTED`, then `list_tasks` again without a status filter and keep any
  task whose `dueDate` is before today and whose status isn't COMPLETED. Page through every result.
- Drop work orders (`type: WORK_ORDER`) from the list; they are children of a task, not tasks to triage.
  Do use them to tell whether a task already has a vendor: a task counts as **unassigned** when it has no
  assigned users and no linked work order with a vendor.
- If the person names a property, filter to it (`filter_property`).

## 2. Rank by severity

Read each task's subject, description, type, priority, property and unit, and look at any pictures attached
to it. Give each task a level:

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

1. Serves the task's property (the vendor's properties list).
2. Notes that fit the job (trade, specialties, "emergency calls", "preferred for X", "do not use").
3. Trade or category fields, company name, and any other vendor field that points at the work.
4. Past work orders on the same property or for the same kind of problem.

Skip vendors that are inactive or whose notes say not to use them. Propose one vendor with the reasons, plus
up to two backups. The person confirms or picks another.

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
