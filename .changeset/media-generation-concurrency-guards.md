---
'@modern-admin/core': minor
'@modern-admin/nest': patch
'@modern-admin/system-prisma': patch
'@modern-admin/system-drizzle': patch
---

Close media generation apply/cancel/budget race conditions.

- **Apply is serialized per task.** Two overlapping apply requests for the same
  task could both pass the `output.applied` guard and upload/edit twice; they
  are chained in-process and the second observes the first's marker.
- **Completion never overwrites cancellation.** `IAiTaskStore.updateStatus`
  gains an optional `expectedStatus` guard so a status write is applied
  atomically only while the task is still in one of the expected states (a
  `WHERE status IN (…)` predicate for SQL stores, a synchronous check-and-set
  in memory). `applyProviderResult` uses it, so a cancel that lands while a
  provider status request is in flight can no longer resurrect the task as
  succeeded/failed — including across nodes on the webhook path.
- **The monthly budget reserves before it checks, one request at a time.** The
  task is enqueued with its estimated cost before the budget is summed, and
  per-user reservations are serialized so concurrent requests near the limit are
  admitted one-by-one — exactly one is accepted rather than all overspending or
  all rejecting. A rejected reservation is failed so its cost stops counting.
