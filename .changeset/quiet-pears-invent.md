---
'@modern-admin/ui': patch
'@modern-admin/core': patch
'@modern-admin/adapter-prisma': patch
---

Stop `datetime` values drifting by the browser↔server timezone offset on save.

`DatePicker` in `mode="datetime"` emitted browser-local wall time with no
offset (`2026-08-04T15:00`). Per spec, `new Date(...)` resolves an offset-less
date-time in the *running process's* timezone, so the Prisma adapter stored a
different instant than the user picked whenever the two timezones differed —
and because the show/edit views render the instant back in browser-local time,
re-saving an untouched record shifted it again. With a browser on UTC+3 and an
API on UTC (the default in a plain Docker image), three hours were added per
round trip.

- `@modern-admin/ui` now emits a full UTC instant (`toISOString()`) for
  datetime. The visible text input keeps its human-readable
  `yyyy-MM-dd HH:mm` shape; only the wire format changed. `mode="date"` is
  unaffected — a bare `yyyy-MM-dd` is already spec'd to parse as UTC midnight.
- `@modern-admin/core` exports `parseDateValue`, which reads an offset-less
  date-time as UTC instead of inheriting `process.env.TZ`, and uses it when
  coercing filter values. `@modern-admin/adapter-prisma` uses it when
  normalising `DateTime` writes. Explicit offsets (`Z`, `+03:00`) are honoured
  as given. This keeps older clients, form posts and hand-written API calls
  correct without depending on deployment config.
