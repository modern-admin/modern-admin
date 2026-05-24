import { compactVerify, importJWK, importSPKI } from 'jose'
import {
  DEFAULT_LICENSE_PUBLIC_KEY_PEM,
  PUBLIC_KEY_IS_PLACEHOLDER,
} from './public-key.js'
import type {
  LicenseCheck,
  LicenseCheckFailureReason,
  LicensePayload,
  VerifyLicenseOptions,
} from './types.js'

const DEFAULT_ISSUER = 'modernadminpro.com'
const DEFAULT_GRACE_DAYS = 7

const fail = (reason: LicenseCheckFailureReason): LicenseCheck => ({
  valid: false,
  reason,
})

function isPayloadShape(value: unknown): value is LicensePayload {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.iss === 'string' &&
    typeof p.sub === 'string' &&
    (p.tier === 'pro' || p.tier === 'enterprise') &&
    Array.isArray(p.features) &&
    p.features.every((f) => typeof f === 'string') &&
    typeof p.seats === 'number' &&
    typeof p.iat === 'number' &&
    typeof p.exp === 'number'
  )
}

function tierSatisfies(actual: 'pro' | 'enterprise', required: 'pro' | 'enterprise'): boolean {
  if (required === 'pro') return actual === 'pro' || actual === 'enterprise'
  return actual === 'enterprise'
}

type VerifyKey = Awaited<ReturnType<typeof importSPKI>>

async function loadPublicKey(src: string | Record<string, unknown>): Promise<VerifyKey> {
  if (typeof src === 'string') {
    return importSPKI(src, 'EdDSA')
  }
  return importJWK(src as never, 'EdDSA') as Promise<VerifyKey>
}

/**
 * Verify a Modern Admin license token (Ed25519 compact JWS).
 *
 * Performs **offline-only** verification:
 *   1. Decodes the compact JWS and verifies the Ed25519 signature against
 *      the embedded (or overridden) public key.
 *   2. Validates payload shape.
 *   3. Checks `iss` matches expected issuer.
 *   4. Enforces `tier` (when caller required one).
 *   5. Enforces that `feature` appears in `payload.features`.
 *   6. Enforces `iat <= now < exp + gracePeriod` (with `inGracePeriod` flag
 *      when `now >= exp`).
 *
 * Never throws — always returns `{ valid, reason? }`. Callers should
 * `console.warn` on `!valid` and gracefully disable the feature.
 *
 * Online revoke checks are intentionally OUT of scope for this version
 * (Phase 4 introduces the license-issuance backend; revoke endpoint
 * lands then).
 */
export async function verifyLicense(
  token: string | undefined | null,
  opts: VerifyLicenseOptions,
): Promise<LicenseCheck> {
  if (!token) return fail('missing')

  const expectedIssuer = opts.expectedIssuer ?? DEFAULT_ISSUER
  const keySource =
    opts.publicKey ??
    process.env.MODERN_ADMIN_LICENSE_PUBLIC_KEY ??
    DEFAULT_LICENSE_PUBLIC_KEY_PEM

  let publicKey: VerifyKey
  try {
    publicKey = await loadPublicKey(keySource)
  } catch {
    return fail('malformed')
  }

  let raw: Uint8Array
  try {
    const verified = await compactVerify(token, publicKey)
    raw = verified.payload
  } catch {
    return fail('bad-signature')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return fail('malformed')
  }
  if (!isPayloadShape(parsed)) return fail('malformed')
  const payload: LicensePayload = parsed

  if (payload.iss !== expectedIssuer) return fail('wrong-issuer')

  if (opts.tier && !tierSatisfies(payload.tier, opts.tier)) {
    return fail('wrong-tier')
  }

  if (!payload.features.includes(opts.feature)) {
    return fail('feature-not-licensed')
  }

  const nowMs = (opts.now ? opts.now() : new Date()).getTime()
  const nowSec = Math.floor(nowMs / 1000)

  if (nowSec < payload.iat) return fail('not-yet-valid')

  const gracePeriodDays = payload.gracePeriodDays ?? DEFAULT_GRACE_DAYS
  const graceExp = payload.exp + gracePeriodDays * 24 * 60 * 60

  if (nowSec >= graceExp) return fail('expired')

  const inGracePeriod = nowSec >= payload.exp
  return inGracePeriod
    ? { valid: true, license: payload, inGracePeriod: true }
    : { valid: true, license: payload }
}

/** Re-export so callers can detect placeholder builds. */
export { PUBLIC_KEY_IS_PLACEHOLDER }
