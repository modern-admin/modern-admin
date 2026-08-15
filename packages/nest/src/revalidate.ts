// Shared detection of a "give me fresh data" request.
//
// The admin UI's refresh button sends `Cache-Control: no-cache`, the
// standard way for a client to ask for revalidation. Two layers act on it
// and must agree on what counts as one:
//
//   * `ModernAdminCacheInterceptor` — skips the HTTP response cache so the
//     controller actually runs.
//   * `ResourceController` — forwards it as `ActionRequest.refresh`, which
//     makes the action-layer cache read past its entry and invalidate the
//     resource's tags when the data turns out to have moved.
//
// Non-refresh requests are untouched, so the cache still absorbs the
// ordinary navigation traffic.

const NO_CACHE = /no-cache|no-store/i

/**
 * True when the request carries `Cache-Control: no-cache` / `no-store`
 * (or the legacy `Pragma: no-cache`). Accepts the raw header bag as
 * `unknown` so both the express request and the Nest `@Req()` shape can
 * pass it straight through.
 */
export const wantsRevalidation = (headers: unknown): boolean => {
  if (typeof headers !== 'object' || headers === null) return false
  const bag = headers as Record<string, string | string[] | undefined>
  for (const name of ['cache-control', 'pragma']) {
    const raw = bag[name]
    const value = Array.isArray(raw) ? raw.join(',') : raw
    if (typeof value === 'string' && NO_CACHE.test(value)) return true
  }
  return false
}
