---
'@modern-admin/nest': patch
---

Close three media generation race conditions flagged in review:

- **Apply is now serialized per task.** Two overlapping apply requests for the
  same task could both pass the `output.applied` guard and upload/edit twice;
  they are chained in-process and the second observes the first's marker.
- **Completion no longer overwrites cancellation.** `applyProviderResult`
  re-reads the task and bails when it is already terminal, so a cancel that
  lands while a provider status request is in flight (webhook path) can't
  resurrect the task as succeeded/failed.
- **The monthly budget reserves before it checks.** The task is enqueued with
  its estimated cost before the budget is summed, so two concurrent requests
  for the same user near the limit can no longer both read a stale total and
  submit paid provider calls; a rejected reservation is failed so its cost is
  excluded from future sums.
