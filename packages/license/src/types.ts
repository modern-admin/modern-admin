/**
 * License key payload — the body of the Ed25519/JWS-signed token issued by
 * the modernadminpro.com license-issuance backend.
 *
 * Format: compact JWS with header `{ alg: 'EdDSA', typ: 'JWT', kid: '<key-id>' }`.
 * The payload below is base64url-encoded as the JWS body.
 */
export interface LicensePayload {
  /** Issuer host — always 'modernadminpro.com' for prod licenses. */
  iss: string
  /** Subject — customer identifier (UUID v7). */
  sub: string
  /** Tier of the license. */
  tier: 'pro' | 'enterprise'
  /**
   * Feature flags this license entitles the customer to. Each
   * commercial package checks one of these — e.g. `feature-ai-fill`
   * looks for `ai-fill`, `feature-webhooks` for `webhooks`, etc.
   */
  features: string[]
  /** Seats (developer count). */
  seats: number
  /** Issued-at (unix seconds). */
  iat: number
  /** Expiration (unix seconds). */
  exp: number
  /**
   * Optional grace-period in days after `exp` during which the license
   * still verifies (with a warning). Defaults to 7 days when omitted.
   */
  gracePeriodDays?: number
}

/** Result of a verifyLicense call. */
export interface LicenseCheck {
  /** True iff the license is well-formed, signed by the expected key, and within validity (incl. grace). */
  valid: boolean
  /** When `valid === false`, a stable reason code suitable for logging. */
  reason?: LicenseCheckFailureReason
  /** When `valid === true`, the decoded payload. */
  license?: LicensePayload
  /**
   * True iff the license is past `exp` but within the grace period.
   * Caller should warn but still allow the feature.
   */
  inGracePeriod?: boolean
}

export type LicenseCheckFailureReason =
  | 'missing'
  | 'malformed'
  | 'bad-signature'
  | 'wrong-issuer'
  | 'wrong-tier'
  | 'feature-not-licensed'
  | 'expired'
  | 'not-yet-valid'

/** Options accepted by `verifyLicense`. */
export interface VerifyLicenseOptions {
  /** The feature flag the caller needs (e.g. 'ai-fill'). */
  feature: string
  /**
   * Optional tier requirement. When set, the license must include this
   * tier OR a strictly higher one (`enterprise` satisfies `pro`).
   */
  tier?: 'pro' | 'enterprise'
  /**
   * Override the embedded public key — primarily for tests. Accepts a
   * PEM-encoded SPKI Ed25519 public key OR a JWK (loose-typed object).
   */
  publicKey?: string | Record<string, unknown>
  /** Override the current time (for tests). */
  now?: () => Date
  /** Expected issuer host. Default 'modernadminpro.com'. */
  expectedIssuer?: string
}
