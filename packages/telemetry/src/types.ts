/**
 * Shape of a single telemetry ping. Contains only technical/aggregate data —
 * no resource names, record contents, user identifiers, or secrets.
 *
 * The `instanceId` is a UUID v7 generated once per process start. It is
 * **not** persisted to disk and cannot be used to track installations across
 * restarts. Its only purpose is server-side deduplication of rapid re-pings
 * from the same running process (e.g., on hot-reload).
 */
export interface TelemetryInfo {
  /** UUID v7, generated fresh each process start, never persisted. */
  instanceId: string
  /**
   * Short adapter name(s) in use — derived from the adapter `Database`
   * constructor name (e.g. `"prisma"`, `"drizzle"`, `"unknown"`).
   * Does not reveal schema details.
   */
  adapters: string[]
  /** Total number of registered resources (no names). */
  resourceCount: number
  /**
   * Active commercial feature flags — the string list passed to
   * `new ModernAdmin({ featureFlags: [...] })`. Consumers who don't use
   * Pro packages always see `[]` here.
   */
  featureFlags: string[]
  /**
   * Enabled admin-subsystem capabilities (keys from `AdminFeatures`).
   * Only the `true` entries are included to keep payloads compact.
   */
  features: string[]
  /** `process.platform` value (e.g. `"linux"`, `"darwin"`, `"win32"`). */
  platform: string
  /**
   * Runtime and version string. `"bun/1.3.13"` or `"node/20.0.0"`,
   * depending on which runtime executes the server.
   */
  runtime: string
}
