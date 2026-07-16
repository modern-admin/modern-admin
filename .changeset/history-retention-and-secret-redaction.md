---
"@modern-admin/core": minor
"@modern-admin/feature-history": minor
---

History revisions now support retention and redact secrets by default.

- `IHistoryStore` gains an optional `prune(retention)` method and a new
  `HistoryRetention` type (`keepLast`, `keepDays`). `MemoryHistoryStore`
  takes a retention policy in its constructor and self-trims on append
  (per-record ring buffer + age cutoff), so the default in-memory store no
  longer grows unbounded — it previously kept two full snapshots per
  revision forever.
- `historyFeature` / `historyPlugin` accept `keepLast` and `keepDays`,
  passed to the default store and enforced after every append on any store
  that implements `prune`.
- The in-memory fallback now logs a one-time warning outside tests when no
  persistent store is configured.
- Snapshots exclude secrets by default: `password`-typed properties and
  statically inaccessible properties (`isAccessible: false`) are stripped
  from `snapshot` / `snapshotBefore`. Opt back in with `includeSecrets: true`.
