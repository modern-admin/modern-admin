import { verifyLicense } from './verify.js'
import type { LicenseCheck, VerifyLicenseOptions } from './types.js'

/**
 * Bootstrap helper used by commercial packages on module init.
 *
 * Reads `MODERN_ADMIN_LICENSE_KEY` from env (or accepts an explicit
 * token), verifies it for the requested feature/tier, and returns the
 * check result. Convenience wrapper around `verifyLicense` that
 * centralises the env-var name + a single `console.warn` on invalid
 * licenses with a stable prefix grep-able from production logs.
 *
 * Callers:
 *   ```ts
 *   const license = await loadAndCheckLicense({ feature: 'ai-fill', tier: 'pro' })
 *   if (!license.valid) return // disable the feature, do not crash
 *   ```
 */
export async function loadAndCheckLicense(
  opts: VerifyLicenseOptions & { token?: string; packageName?: string },
): Promise<LicenseCheck> {
  // Dev/test bypass — set `MODERN_ADMIN_LICENSE_DEV_BYPASS=1` to skip
  // verification entirely. Used by Pro package unit tests (which assert
  // feature behaviour without setting up real Ed25519 tokens) and during
  // local development of commercial features. Never set this in prod.
  if (process.env.MODERN_ADMIN_LICENSE_DEV_BYPASS === '1') {
    return { valid: true }
  }
  const token = opts.token ?? process.env.MODERN_ADMIN_LICENSE_KEY
  const result = await verifyLicense(token, opts)
  if (!result.valid) {
    const pkgPrefix = opts.packageName ? `[${opts.packageName}] ` : ''
    // eslint-disable-next-line no-console
    console.warn(
      `${pkgPrefix}[modern-admin/license] feature "${opts.feature}" disabled: ${result.reason}. ` +
        'Set MODERN_ADMIN_LICENSE_KEY to a valid license token to enable. ' +
        'See https://modernadminpro.com/pricing.',
    )
  } else if (result.inGracePeriod) {
    const pkgPrefix = opts.packageName ? `[${opts.packageName}] ` : ''
    // eslint-disable-next-line no-console
    console.warn(
      `${pkgPrefix}[modern-admin/license] license for "${opts.feature}" is past expiry but ` +
        'within the grace period. Renew at https://modernadminpro.com/renew.',
    )
  }
  return result
}
