/**
 * Process-global registry of active commercial feature flags.
 *
 * Populated by `new ModernAdmin({ featureFlags: [...] })` and consulted by
 * commercial packages (`@modern-admin-pro/*`) to decide whether to wire
 * themselves up. The double check (license-gate inside the Pro package
 * itself + this registry) means a Pro plugin only activates when:
 *
 *   1. a valid licence is present (verified by the Pro package on import); AND
 *   2. the consumer explicitly listed the feature in `featureFlags`.
 *
 * Decoupling these layers avoids accidental activation: even if a customer
 * has a license that covers `webhooks`, the webhooks plugin stays dormant
 * unless they opt in via `featureFlags: ['webhooks']`.
 *
 * The registry is intentionally process-global (not per-instance) because
 * feature factories run at config time, before any `ModernAdmin` instance
 * can be passed around. A single ModernAdmin per process is the supported
 * pattern; multi-instance is fine as long as the flag sets agree.
 */

const activeFlags = new Set<string>()

/**
 * Replace the active flag set. Idempotent. ModernAdmin calls this from its
 * constructor with the resolved `featureFlags` option.
 */
export function setActiveFeatureFlags(flags: Iterable<string>): void {
  activeFlags.clear()
  for (const f of flags) activeFlags.add(f)
}

/**
 * `true` iff `feature` was passed to `ModernAdmin` via `featureFlags`.
 * Commercial packages call this to short-circuit their `apply()` /
 * feature-factory body when the consumer has not opted in.
 */
export function isFeatureActive(feature: string): boolean {
  return activeFlags.has(feature)
}

/** Snapshot of currently active flags. Useful for diagnostics and tests. */
export function getActiveFeatureFlags(): readonly string[] {
  return Array.from(activeFlags)
}
