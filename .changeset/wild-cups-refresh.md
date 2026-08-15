---
'@modern-admin/core': minor
'@modern-admin/nest': minor
'@modern-admin/react': minor
---

List view refresh now bypasses the server cache

The refresh button used to only refetch the client-side query — within the
HTTP/action cache TTL the server replayed the very entry the user was trying
to get past, so "refresh" could show stale rows.

It now sends `Cache-Control: no-cache`, which the REST layer forwards as
`ActionRequest.refresh`. The list action reads straight from the database,
compares the result with what was cached, and — only when the rows actually
moved — invalidates the resource's server-side caches (list, records and
dependent resources) before storing the fresh response. Unchanged data is
served as-is, so a refresh no longer costs neighbouring cached scopes.

- `core`: `CacheRuntimeReadOptions` gains `refresh` / `onChanged`;
  `ActionRequest` gains `refresh`.
- `nest`: the HTTP cache interceptor honours `Cache-Control: no-cache`
  (`x-cache: REVALIDATED`) instead of serving a HIT.
- `react`: `AdminClient.list()` takes `{ refresh }`, and the new
  `useRefreshRecords()` hook drives the list view's refresh button and `R`
  hotkey.
