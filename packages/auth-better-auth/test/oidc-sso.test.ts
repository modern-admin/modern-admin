import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { uuidv7 } from '@modern-admin/core'
import { accountIdentityPlugin, BetterAuthProvider, oidcSsoPlugin } from '../src'

const ISSUER = 'https://sso.example.test/application/o/admin/'
const API = 'https://admin.example.test'
const PATH = '/admin/api/auth'
const CONFIG = {
  providerId: 'authentik',
  name: 'Company SSO',
  issuer: ISSUER,
  clientId: 'admin-client',
  clientSecret: 'test-client-secret',
}
const fetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetch
})

const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url')

async function flow(
  options: {
    known?: boolean
    claims?: Record<string, unknown>
    noToken?: boolean
    discoveryIssuer?: string
    missingJwks?: boolean
    allowSignUp?: boolean
    invalidSignature?: boolean
    localEmailVerified?: boolean
  } = {},
) {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const publicKey = {
    ...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  }
  let nonce = ''
  const userId = uuidv7()
  const db: Record<string, Record<string, unknown>[]> = {
    user:
      options.known === false
        ? []
        : [
            {
              id: userId,
              email: 'admin@example.test',
              emailVerified: options.localEmailVerified ?? true,
              name: 'Local admin',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'viewer',
            },
          ],
    account: [],
    session: [],
    verification: [],
  }
  const idToken = async () => {
    const now = Math.floor(Date.now() / 1000)
    const data = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode({ iss: ISSUER, sub: 'stable-subject', aud: CONFIG.clientId, iat: now, exp: now + 300, nonce, email: 'admin@example.test', email_verified: true, name: 'SSO admin', role: 'admin', ...options.claims })}`
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      keys.privateKey,
      new TextEncoder().encode(data),
    )
    if (options.invalidSignature) new Uint8Array(signature)[0]! ^= 1
    return `${data}.${Buffer.from(signature).toString('base64url')}`
  }
  const requests = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | Request | URL) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url === `${ISSUER}.well-known/openid-configuration`)
          return Response.json({
            issuer: options.discoveryIssuer ?? ISSUER,
            authorization_endpoint: `${ISSUER}authorize`,
            token_endpoint: `${ISSUER}token`,
            userinfo_endpoint: `${ISSUER}userinfo`,
            ...(!options.missingJwks ? { jwks_uri: `${ISSUER}jwks` } : {}),
            id_token_signing_alg_values_supported: ['RS256'],
          })
        if (url === `${ISSUER}jwks`) return Response.json({ keys: [publicKey] })
        if (url === `${ISSUER}userinfo`)
          return Response.json({
            sub: 'stable-subject',
            email: 'admin@example.test',
            email_verified: true,
          })
        if (url === `${ISSUER}token`)
          return Response.json({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            ...(!options.noToken ? { id_token: await idToken() } : {}),
          })
        throw new Error(`Unexpected fetch: ${url}`)
      },
      { preconnect: fetch.preconnect },
    ),
  )
  const auth = betterAuth({
    baseURL: API,
    basePath: PATH,
    secret: uuidv7().repeat(2),
    database: memoryAdapter(db),
    trustedOrigins: [API],
    advanced: { database: { generateId: () => uuidv7() } },
    rateLimit: { enabled: false },
    logger: { disabled: true },
    emailAndPassword: { enabled: false },
    user: { additionalFields: { role: { type: 'string', required: false, input: false } } },
    account: { accountLinking: { enabled: true, trustedProviders: ['authentik'] } },
    plugins: [
      accountIdentityPlugin(),
      oidcSsoPlugin({ providers: [{ ...CONFIG, allowSignUp: options.allowSignUp }] }),
    ],
  })
  await auth.$context
  const jar = new Map<string, string>()
  const receive = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]!
      const i = pair.indexOf('=')
      if (/max-age=0/i.test(cookie)) jar.delete(pair.slice(0, i))
      else jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
  }
  const headers = () => ({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') })
  const callback = new URL(`${API}${PATH}/callback/authentik`)
  const begin = async () => {
    const start = await auth.handler(
      new Request(`${API}${PATH}/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: API },
        body: JSON.stringify({
          provider: CONFIG.providerId,
          callbackURL: `${API}/admin`,
          errorCallbackURL: `${API}/admin`,
          requestSignUp: true,
        }),
      }),
    )
    expect(start.status).toBe(200)
    receive(start)
    const authorization = new URL(((await start.json()) as { url: string }).url)
    nonce = authorization.searchParams.get('nonce')!
    callback.searchParams.set('state', authorization.searchParams.get('state')!)
    callback.searchParams.set('code', 'authorization-code')
    return authorization
  }
  const authorization = await begin()
  const complete = async () => {
    const response = await auth.handler(new Request(callback.toString(), { headers: headers() }))
    receive(response)
    return response
  }
  return { auth, db, userId, authorization, begin, complete, callback, jar, headers, requests }
}

describe('OIDC SSO', () => {
  it('keeps the linked account owner when their verified IdP email changes', async () => {
    const claims = { email: 'admin@example.test' }
    const f = await flow({ claims })
    expect((await f.complete()).headers.get('location')).toBe(`${API}/admin`)
    claims.email = 'renamed@example.test'
    await f.begin()
    expect((await f.complete()).headers.get('location')).toBe(`${API}/admin`)
    expect(f.db.user).toHaveLength(1)
    expect(f.db.account).toHaveLength(1)
    expect(f.db.account![0]!.userId).toBe(f.userId)
    expect(
      await new BetterAuthProvider({ auth: f.auth }).getCurrentUser({ headers: f.headers() }),
    ).toMatchObject({ id: f.userId })
  })

  it('rejects an old account bound to a different issuer under the same provider id', async () => {
    const f = await flow()
    f.db.account!.push({
      id: uuidv7(),
      providerId: CONFIG.providerId,
      accountId: 'stable-subject',
      issuer: 'https://old-issuer.example.test',
      userId: f.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect((await f.complete()).headers.get('location')).toContain('error=')
    expect(f.db.session).toHaveLength(0)
    expect(f.db.account![0]!.issuer).toBe('https://old-issuer.example.test')
  })

  it('links a verified identity, keeps the local role and establishes a real admin session', async () => {
    const f = await flow()
    expect(f.authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(f.authorization.searchParams.get('nonce')).toBeTruthy()
    expect(f.authorization.searchParams.get('scope')?.split(' ')).toEqual([
      'openid',
      'email',
      'profile',
    ])
    expect(f.authorization.searchParams.get('redirect_uri')).toBe(
      `${API}${PATH}/callback/authentik`,
    )
    expect((await f.complete()).headers.get('location')).toBe(`${API}/admin`)
    expect(f.db.user).toHaveLength(1)
    expect(f.db.account).toHaveLength(1)
    expect(f.db.account![0]).toMatchObject({
      userId: f.userId,
      providerId: 'authentik',
      issuer: ISSUER,
      accountId: 'stable-subject',
    })
    const provider = new BetterAuthProvider({ auth: f.auth })
    expect(await provider.getCurrentUser({ headers: f.headers() })).toMatchObject({
      id: f.userId,
      role: 'viewer',
    })
    expect(provider.getUiProps()).toEqual({
      providers: ['authentik'],
      providerLabels: { authentik: 'Company SSO' },
      emailAndPassword: false,
    })
    expect(JSON.stringify(provider.getUiProps())).not.toContain(CONFIG.clientSecret)
  })

  it('rejects unknown users by default even when requestSignUp is supplied', async () => {
    const f = await flow({ known: false })
    expect((await f.complete()).headers.get('location')).toContain('error=')
    expect(f.db.user).toHaveLength(0)
    expect(f.db.account).toHaveLength(0)
    expect(f.db.session).toHaveLength(0)
  })

  it('allows explicitly enabled provisioning without importing a role from the IdP', async () => {
    const f = await flow({ known: false, allowSignUp: true })
    expect((await f.complete()).headers.get('location')).toBe(`${API}/admin`)
    expect(f.db.user).toHaveLength(1)
    expect(f.db.user![0]!.role).toBeUndefined()
  })

  it.each([
    { email_verified: false },
    { iss: 'https://attacker.example.test' },
    { aud: 'another-client' },
    { exp: 1 },
    { nonce: 'wrong-nonce' },
    { sub: '' },
  ])(
    'rejects invalid claims %j without linking an account or creating a session',
    async (claims) => {
      const f = await flow({ claims })
      expect((await f.complete()).headers.get('location')).toContain('error=')
      expect(f.db.account).toHaveLength(0)
      expect(f.db.session).toHaveLength(0)
    },
  )

  it('requires an ID token even when userinfo could be available', async () => {
    const f = await flow({ noToken: true })
    expect((await f.complete()).headers.get('location')).toContain('error=')
    expect(f.db.session).toHaveLength(0)
  })

  it.each([{ invalidSignature: true }, { localEmailVerified: false }])(
    'rejects an invalid signature or unverified local email %j',
    async (options) => {
      const f = await flow(options)
      expect((await f.complete()).headers.get('location')).toContain('error=')
      expect(f.db.account).toHaveLength(0)
      expect(f.db.session).toHaveLength(0)
    },
  )

  it('rejects callbacks without the initiating browser state', async () => {
    const f = await flow()
    f.jar.clear()
    expect((await f.complete()).headers.get('location')).toContain('error=state_mismatch')
    expect(f.db.session).toHaveLength(0)
    expect(f.requests.mock.calls.some(([input]) => String(input).endsWith('/token'))).toBe(false)
  })

  it('disables password login at the server for SSO-only hosts', async () => {
    const f = await flow()
    const response = await f.auth.handler(
      new Request(`${API}${PATH}/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: API },
        body: JSON.stringify({ email: 'admin@example.test', password: 'test-password' }),
      }),
    )
    expect(response.ok).toBe(false)
    expect(f.db.session).toHaveLength(0)
  })

  it.each([{ discoveryIssuer: 'https://unexpected.example.test' }, { missingJwks: true }])(
    'fails closed on invalid discovery %j',
    async (options) => {
      await expect(flow(options)).rejects.toThrow('SSO discovery failed or issuer mismatch')
    },
  )

  it('validates URLs and rejects duplicate/reserved provider ids before initialization', () => {
    expect(() =>
      oidcSsoPlugin({ providers: [{ ...CONFIG, issuer: 'http://sso.example.test' }] }),
    ).toThrow()
    expect(() => oidcSsoPlugin({ providers: [CONFIG, CONFIG] })).toThrow('Duplicate or reserved')
    expect(() => oidcSsoPlugin({ providers: [{ ...CONFIG, providerId: 'google' }] })).toThrow(
      'Duplicate or reserved',
    )
  })
})
