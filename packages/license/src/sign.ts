import { CompactSign, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8 } from 'jose'
import type { LicensePayload } from './types.js'

const DEFAULT_ISSUER = 'modernadminpro.com'

export interface SignLicenseOptions {
  /** PKCS8 PEM Ed25519 private key. */
  privateKeyPem: string
  /**
   * Key ID — embedded in the JWS `kid` header for key rotation.
   * Stored as `LicenseRecord.keyId` in the backend DB.
   * Should be a UUID v7.
   */
  kid: string
  /** Issuer. Defaults to 'modernadminpro.com'. */
  issuer?: string
}

/**
 * Sign a license payload and return a compact Ed25519 JWS token.
 *
 * The returned string is what gets stored in `LicenseRecord.jws` and
 * delivered to the customer as `MODERN_ADMIN_LICENSE_KEY`.
 */
export async function signLicense(
  payload: Omit<LicensePayload, 'iss'>,
  opts: SignLicenseOptions,
): Promise<string> {
  const issuer = opts.issuer ?? DEFAULT_ISSUER
  const fullPayload: LicensePayload = { iss: issuer, ...payload }

  const privateKey = await importPKCS8(opts.privateKeyPem, 'EdDSA')

  const bytes = new TextEncoder().encode(JSON.stringify(fullPayload))

  const jws = await new CompactSign(bytes)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: opts.kid })
    .sign(privateKey)

  return jws
}

export interface LicenseKeyPair {
  /** SPKI PEM — embed in `packages/license/src/public-key.ts`. */
  publicKeyPem: string
  /** PKCS8 PEM — store in `LICENSE_PRIVATE_KEY_PEM` env var (never commit). */
  privateKeyPem: string
}

/**
 * Generate a fresh Ed25519 key pair for license signing.
 *
 * Usage (one-time, keep private key out of version control):
 *
 * ```ts
 * import { generateLicenseKeyPair } from '@modern-admin/license'
 * const { publicKeyPem, privateKeyPem } = await generateLicenseKeyPair()
 * console.log('PUBLIC (embed in public-key.ts):\n', publicKeyPem)
 * console.log('PRIVATE (store in env):\n', privateKeyPem)
 * ```
 */
export async function generateLicenseKeyPair(): Promise<LicenseKeyPair> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
  const publicKeyPem = await exportSPKI(publicKey)
  const privateKeyPem = await exportPKCS8(privateKey)
  return { publicKeyPem, privateKeyPem }
}
