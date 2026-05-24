import type { TelemetryInfo } from './types.js'

/** Default endpoint — the license-issuance / telemetry backend. */
const TELEMETRY_ENDPOINT = 'https://api.modernadminpro.com/telemetry'

/** Guard against double-pings from hot-reload without a process restart. */
let _reported = false

/**
 * Fire-and-forget telemetry ping. Exits immediately when the
 * `MODERN_ADMIN_TELEMETRY` environment variable is not set to `"1"`.
 *
 * The function:
 * - Never throws — any network error is silently swallowed.
 * - Pings at most once per process lifetime (subsequent calls are no-ops).
 * - Times out after 5 s to prevent blocking server startup.
 * - Sends a single `POST` with the `TelemetryInfo` payload as JSON.
 *
 * @param info   Payload built by `collectTelemetryInfo`.
 * @param opts.endpoint Override the default endpoint (useful in tests).
 */
export async function reportTelemetry(
  info: TelemetryInfo,
  opts?: { endpoint?: string },
): Promise<void> {
  if (process.env.MODERN_ADMIN_TELEMETRY !== '1') return
  if (_reported) return
  _reported = true

  const url = opts?.endpoint ?? TELEMETRY_ENDPOINT
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5_000)
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(info),
      signal: ac.signal,
    })
    clearTimeout(timer)
  } catch {
    // Telemetry failures must NEVER surface to or affect the host application.
  }
}

/**
 * Reset the "already reported" guard (test helper only).
 * @internal
 */
export function _resetReported(): void {
  _reported = false
}
