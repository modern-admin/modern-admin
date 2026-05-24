import { beforeAll, describe, expect, it } from 'bun:test'
import { CompactSign, exportSPKI, generateKeyPair } from 'jose'
import { verifyLicense } from '../src/verify.js'
import type { LicensePayload } from '../src/types.js'

const now = () => new Date('2026-06-01T00:00:00Z')
const nowSec = Math.floor(now().getTime() / 1000)

type SignKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

let privateKey: SignKey
let publicKeyPem: string

async function sign(payload: unknown): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(payload))
  return new CompactSign(body)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .sign(privateKey)
}

function fullPayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    iss: 'modernadminpro.com',
    sub: 'cust_01',
    tier: 'pro',
    features: ['ai-fill', 'webhooks'],
    seats: 5,
    iat: nowSec - 3600,
    exp: nowSec + 3600,
    ...overrides,
  }
}

beforeAll(async () => {
  const kp = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  privateKey = kp.privateKey
  publicKeyPem = await exportSPKI(kp.publicKey)
})

describe('verifyLicense', () => {
  it('returns missing for empty/undefined token', async () => {
    const a = await verifyLicense('', { feature: 'ai-fill', publicKey: publicKeyPem, now })
    const b = await verifyLicense(undefined, { feature: 'ai-fill', publicKey: publicKeyPem, now })
    const c = await verifyLicense(null, { feature: 'ai-fill', publicKey: publicKeyPem, now })
    expect(a.valid).toBe(false)
    expect(a.reason).toBe('missing')
    expect(b.reason).toBe('missing')
    expect(c.reason).toBe('missing')
  })

  it('accepts a well-formed, signed, in-window token', async () => {
    const token = await sign(fullPayload())
    const r = await verifyLicense(token, { feature: 'ai-fill', publicKey: publicKeyPem, now })
    expect(r.valid).toBe(true)
    expect(r.license?.sub).toBe('cust_01')
    expect(r.inGracePeriod).toBeUndefined()
  })

  it('rejects bad signatures (token signed by a different key)', async () => {
    const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
    const body = new TextEncoder().encode(JSON.stringify(fullPayload()))
    const evilToken = await new CompactSign(body)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .sign(other.privateKey)
    const r = await verifyLicense(evilToken, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('bad-signature')
  })

  it('rejects malformed (non-JWS) tokens', async () => {
    const r = await verifyLicense('not-a-jws-at-all', {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('bad-signature')
  })

  it('rejects when feature is not in the licensed features array', async () => {
    const token = await sign(fullPayload({ features: ['logging'] }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('feature-not-licensed')
  })

  it('rejects when issuer does not match', async () => {
    const token = await sign(fullPayload({ iss: 'evil.example.com' }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('wrong-issuer')
  })

  it('rejects when tier requirement is enterprise but token is pro', async () => {
    const token = await sign(fullPayload({ tier: 'pro' }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      tier: 'enterprise',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('wrong-tier')
  })

  it('accepts when tier is pro and token is enterprise (enterprise >= pro)', async () => {
    const token = await sign(fullPayload({ tier: 'enterprise' }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      tier: 'pro',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(true)
  })

  it('rejects iat in the future', async () => {
    const token = await sign(fullPayload({ iat: nowSec + 3600, exp: nowSec + 7200 }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('not-yet-valid')
  })

  it('flags inGracePeriod when now is past exp but within default grace (7d)', async () => {
    const past = nowSec - 24 * 3600 // expired 1 day ago
    const token = await sign(fullPayload({ exp: past }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(true)
    expect(r.inGracePeriod).toBe(true)
  })

  it('rejects expired tokens past the grace window', async () => {
    const expiredLongAgo = nowSec - 30 * 24 * 3600
    const token = await sign(fullPayload({ exp: expiredLongAgo }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('expired')
  })

  it('respects custom gracePeriodDays', async () => {
    const past1d = nowSec - 24 * 3600
    const token = await sign(fullPayload({ exp: past1d, gracePeriodDays: 0 }))
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('expired')
  })

  it('rejects payloads missing required fields', async () => {
    const token = await sign({ iss: 'modernadminpro.com', sub: 'x' })
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('malformed')
  })

  it('rejects when publicKey override is unparseable', async () => {
    const token = await sign(fullPayload())
    const r = await verifyLicense(token, {
      feature: 'ai-fill',
      publicKey: 'not-a-pem',
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('malformed')
  })

  it('supports JWK as publicKey override', async () => {
    const { exportJWK } = await import('jose')
    const kp = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
    const jwk = await exportJWK(kp.publicKey)
    const body = new TextEncoder().encode(JSON.stringify(fullPayload()))
    const token = await new CompactSign(body)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .sign(kp.privateKey)
    const r = await verifyLicense(token, { feature: 'ai-fill', publicKey: jwk as unknown as Record<string, unknown>, now })
    expect(r.valid).toBe(true)
  })
})
