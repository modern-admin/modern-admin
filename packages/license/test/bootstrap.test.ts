import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test'
import { CompactSign, exportSPKI, generateKeyPair } from 'jose'
import { loadAndCheckLicense } from '../src/bootstrap.js'
import type { LicensePayload } from '../src/types.js'

type SignKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

let privateKey: SignKey
let publicKeyPem: string
const now = () => new Date('2026-06-01T00:00:00Z')
const nowSec = Math.floor(now().getTime() / 1000)

beforeAll(async () => {
  const kp = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  privateKey = kp.privateKey
  publicKeyPem = await exportSPKI(kp.publicKey)
})

async function sign(payload: unknown): Promise<string> {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .sign(privateKey)
}

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    iss: 'modernadminpro.com',
    sub: 'cust_01',
    tier: 'pro',
    features: ['ai-fill'],
    seats: 1,
    iat: nowSec - 3600,
    exp: nowSec + 3600,
    ...overrides,
  }
}

describe('loadAndCheckLicense', () => {
  afterEach(() => {
    delete process.env.MODERN_ADMIN_LICENSE_KEY
    delete process.env.MODERN_ADMIN_LICENSE_DEV_BYPASS
    mock.restore()
  })

  it('returns valid without warning when MODERN_ADMIN_LICENSE_DEV_BYPASS=1', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    process.env.MODERN_ADMIN_LICENSE_DEV_BYPASS = '1'
    const r = await loadAndCheckLicense({
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('logs a warn and returns invalid when no token is present', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const r = await loadAndCheckLicense({
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('missing')
    expect(warn).toHaveBeenCalled()
    const msg = (warn.mock.calls[0]?.[0] ?? '') as string
    expect(msg).toContain('modern-admin/license')
    expect(msg).toContain('ai-fill')
  })

  it('reads MODERN_ADMIN_LICENSE_KEY from env when no explicit token given', async () => {
    const token = await sign(payload())
    process.env.MODERN_ADMIN_LICENSE_KEY = token
    const r = await loadAndCheckLicense({
      feature: 'ai-fill',
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(true)
    expect(r.license?.sub).toBe('cust_01')
  })

  it('prefers explicit `token` over env', async () => {
    const goodToken = await sign(payload())
    process.env.MODERN_ADMIN_LICENSE_KEY = 'garbage'
    const r = await loadAndCheckLicense({
      feature: 'ai-fill',
      token: goodToken,
      publicKey: publicKeyPem,
      now,
    })
    expect(r.valid).toBe(true)
  })

  it('logs a separate grace-period warning when token is in grace window', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const expiredYesterday = nowSec - 24 * 3600
    const token = await sign(payload({ exp: expiredYesterday }))
    const r = await loadAndCheckLicense({
      feature: 'ai-fill',
      token,
      publicKey: publicKeyPem,
      packageName: '@modern-admin-pro/feature-ai-fill',
      now,
    })
    expect(r.valid).toBe(true)
    expect(r.inGracePeriod).toBe(true)
    expect(warn).toHaveBeenCalled()
    const msg = (warn.mock.calls[0]?.[0] ?? '') as string
    expect(msg).toContain('grace period')
    expect(msg).toContain('@modern-admin-pro/feature-ai-fill')
  })

  it('does not log a warning when license is valid and not in grace', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const token = await sign(payload())
    await loadAndCheckLicense({
      feature: 'ai-fill',
      token,
      publicKey: publicKeyPem,
      now,
    })
    expect(warn).not.toHaveBeenCalled()
  })
})
