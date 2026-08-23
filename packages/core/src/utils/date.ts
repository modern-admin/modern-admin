// Timezone-stable parsing of date/date-time strings arriving over the wire.
//
// `new Date('2026-08-04T15:00')` is spec'd to resolve an offset-less date-time
// as *local* time of the running process, so the same payload lands on a
// different instant depending on the server's `TZ` — and round-tripping it
// through the UI shifts the value again on every save. Date-only strings
// (`2026-08-04`) are already spec'd as UTC, so they need no special casing.
//
// The modern UI always sends a full instant; this covers older clients, form
// posts, and hand-written API calls, and makes correctness independent of
// deployment config.

/** `YYYY-MM-DD` optionally followed by a `T`/space time, with no zone suffix. */
const OFFSETLESS_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/

/**
 * Parse a date / date-time string, treating an offset-less date-time as UTC
 * rather than as the process's local time. Anything carrying an explicit zone
 * (`Z`, `+03:00`) or any other shape is handed to `new Date` untouched, so an
 * unparseable value still yields an Invalid Date for the caller to detect.
 */
export const parseDateValue = (value: string): Date => {
  const trimmed = value.trim()
  return new Date(
    OFFSETLESS_DATETIME.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed,
  )
}
