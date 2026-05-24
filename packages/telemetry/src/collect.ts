import type { ModernAdmin } from '@modern-admin/core'
import { uuidv7 } from '@modern-admin/core'
import type { TelemetryInfo } from './types.js'

/** Stable per-process identifier (not persisted). */
let _instanceId: string | undefined

/**
 * Build a `TelemetryInfo` snapshot from a running `ModernAdmin` instance.
 * Reads only technical/aggregate data — no resource names, record
 * contents, user data, or secrets are captured.
 *
 * This function is pure (no network I/O). Pass the result to
 * `reportTelemetry` to ship it.
 */
export function collectTelemetryInfo(admin: ModernAdmin): TelemetryInfo {
  if (!_instanceId) _instanceId = uuidv7()

  // Derive a short adapter name from the Database constructor class name.
  // Examples: "PrismaDatabase" → "prisma", "DrizzleDatabase" → "drizzle",
  // anything else → "unknown".
  const adapters = (admin.options.adapters ?? []).map((a) => {
    const raw = (a.Database as { name?: string }).name ?? ''
    const lower = raw.toLowerCase()
    if (lower.includes('prisma')) return 'prisma'
    if (lower.includes('drizzle')) return 'drizzle'
    return 'unknown'
  })

  // Deduplicate (e.g. two Prisma databases registered)
  const uniqueAdapters = [...new Set(adapters)]

  // Collect only the enabled (true) feature flags so the payload stays
  // compact and never leaks false/undefined entries.
  const features: string[] = []
  const adminFeatures = admin.options.features ?? {}
  for (const [key, val] of Object.entries(adminFeatures)) {
    if (val === true) features.push(key)
  }

  const versions = process.versions as Record<string, string | undefined>
  const runtime = versions.bun
    ? `bun/${versions.bun}`
    : `node/${versions.node ?? 'unknown'}`

  return {
    instanceId: _instanceId,
    adapters: uniqueAdapters,
    resourceCount: admin.resources.length,
    featureFlags: admin.options.featureFlags ?? [],
    features,
    platform: process.platform,
    runtime,
  }
}

/**
 * Reset the per-process instance ID (test helper only).
 * @internal
 */
export function _resetInstanceId(): void {
  _instanceId = undefined
}
