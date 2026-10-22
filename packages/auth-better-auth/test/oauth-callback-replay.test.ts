import { describe, expect, it, mock, setSystemTime } from 'bun:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { uuidv7 } from '@modern-admin/core'
import { oauthCallbackReplayPlugin } from '../src'

const API = 'https://api.example.test'
const AUTH_PATH = '/admin/api/auth'
const COOKIE_PREFIX = '__Secure-admin-test'
const APP = 'https://admin.example.test'
const RETURN = `${APP}/admin`

/** Real Better Auth handlers and two replicas; only Google is stubbed. */
async function flow(recovery = true, callbackURL = RETURN) {
  const db: Record<'user' | 'account' | 'session' | 'verification', Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
    verification: [],
  }
  const secret = uuidv7().repeat(2)
  const exchange = mock(async () => ({ accessToken: 'test-access-token' }))
  const makeReplica = async () => {
    const auth = betterAuth({
      baseURL: API,
      basePath: AUTH_PATH,
      advanced: {
        cookiePrefix: 'admin-test',
        database: { generateId: () => uuidv7() },
      },
      session: { cookieCache: { enabled: true } },
      secret,
      trustedOrigins: [APP, 'example://'],
      database: memoryAdapter(db),
      logger: { disabled: true },
      // Isolate OAuth behavior from the process-wide sign-in rate limiter.
      rateLimit: { enabled: false },
      socialProviders: {
        google: {
          clientId: 'test-client',
          clientSecret: 'test-secret',
          getUserInfo: async () => ({
            user: {
              name: 'OAuth test',
              email: 'oauth@example.test',
              emailVerified: true,
            },
            data: {
              sub: 'google-test-user',
              aud: 'test-client',
              azp: 'test-client',
              email: 'oauth@example.test',
              email_verified: true,
              exp: Math.floor(Date.now() / 1000) + 3600,
              iat: Math.floor(Date.now() / 1000),
              iss: 'https://accounts.google.com',
              name: 'OAuth test',
              given_name: 'OAuth',
              family_name: 'test',
              picture: 'https://example.test/avatar.png',
            },
          }),
        },
      },
      plugins: recovery ? [oauthCallbackReplayPlugin()] : [],
    })
    const context = await auth.$context
    const google = context.socialProviders.find((p) => p.id === 'google')!
    google.validateAuthorizationCode = exchange
    return auth
  }
  const [first, second] = await Promise.all([makeReplica(), makeReplica()])
  const jar = new Map<string, string>()
  const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const receive = (response: Response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0]!
      const split = pair.indexOf('=')
      const name = pair.slice(0, split)
      if (/max-age=0/i.test(cookie)) jar.delete(name)
      else jar.set(name, pair.slice(split + 1))
    }
  }
  const signIn = await first.handler(
    new Request(`${API}${AUTH_PATH}/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: APP },
      body: JSON.stringify({ provider: 'google', callbackURL }),
    }),
  )
  expect(signIn.status).toBe(200)
  receive(signIn)
  const payload = (await signIn.json()) as { url: string }
  const authorization = new URL(payload.url)
  const callback = new URL(`${API}${AUTH_PATH}/callback/google`)
  callback.searchParams.set('state', authorization.searchParams.get('state')!)
  callback.searchParams.set('code', 'test-authorization-code')
  const complete = async (url = callback, replica = first) => {
    const response = await replica.handler(
      new Request(url.toString(), { headers: { cookie: cookies() } }),
    )
    receive(response)
    return response
  }
  return { complete, callback, second, jar, db, exchange }
}

describe('OAuth callback replay', () => {
  it('reproduces state_mismatch when a completed callback is replayed without the plugin', async () => {
    const f = await flow(false)
    expect((await f.complete()).headers.get('location')).toBe(RETURN)
    expect((await f.complete(f.callback, f.second)).headers.get('location')).toContain(
      'error=state_mismatch',
    )
  })

  it('redirects an exact replay on another replica without redeeming the code again', async () => {
    const f = await flow()
    const success = await f.complete()
    expect(success.headers.get('location')).toBe(RETURN)
    const receipt = success.headers.getSetCookie().find((v) => v.includes('oauth_callback_result'))
    expect(receipt).toContain('HttpOnly')
    expect(receipt).toContain('Secure')
    expect(receipt).toContain('SameSite=Lax')
    expect(receipt).toContain('Max-Age=60')
    const replay = await f.complete(f.callback, f.second)
    expect(replay.headers.get('location')).toBe(RETURN)
    expect(replay.headers.get('cache-control')).toBe('no-store')
    expect(f.exchange).toHaveBeenCalledTimes(1)
    expect(f.db.session).toHaveLength(1)
    expect(f.db.verification).toHaveLength(0)
  })

  it('requires the browser session even with a valid signed receipt', async () => {
    const f = await flow()
    await f.complete()
    f.jar.delete(`${COOKIE_PREFIX}.session_token`)
    expect((await f.complete()).headers.get('location')).toContain('error=state_mismatch')
  })

  it('rejects a different code, state, or provider', async () => {
    const f = await flow()
    await f.complete()
    for (const key of ['code', 'state', 'provider']) {
      const changed = new URL(f.callback)
      if (key === 'provider') changed.pathname = `${AUTH_PATH}/callback/apple`
      else changed.searchParams.set(key, 'different-value')
      const response = await f.complete(changed)
      expect(response.headers.get('location')).toContain('error=state_mismatch')
    }
    expect(f.exchange).toHaveBeenCalledTimes(1)
  })

  it('rejects a tampered receipt signature', async () => {
    const f = await flow()
    await f.complete()
    const name = `${COOKIE_PREFIX}.oauth_callback_result`
    f.jar.set(name, `${f.jar.get(name)}tampered`)
    expect((await f.complete()).headers.get('location')).toContain('error=state_mismatch')
  })

  it('enforces receipt expiry on the server', async () => {
    const f = await flow()
    await f.complete()
    try {
      setSystemTime(Date.now() + 61_000)
      expect((await f.complete()).headers.get('location')).toContain('error=state_mismatch')
    } finally {
      setSystemTime()
    }
  })

  it('rejects a revoked session despite a still-valid session cache cookie', async () => {
    const f = await flow()
    await f.complete()
    expect(f.jar.has(`${COOKIE_PREFIX}.session_data`)).toBe(true)
    f.db.session.length = 0
    expect((await f.complete()).headers.get('location')).toContain('error=state_mismatch')
  })

  it('rejects a receipt bound to another session of the same user', async () => {
    const f = await flow()
    await f.complete()
    // The browser token now resolves to a replacement server-side session.
    f.db.session[0]!.id = uuidv7()
    expect((await f.complete()).headers.get('location')).toContain('error=state_mismatch')
  })

  it('does not remember a failed code exchange', async () => {
    const f = await flow()
    f.exchange.mockRejectedValue(new Error('provider rejected code'))
    const failure = await f.complete()
    expect(failure.headers.get('location')).toContain('error=invalid_code')
    expect(failure.headers.getSetCookie().some((v) => v.includes('oauth_callback_result'))).toBe(
      false,
    )
    expect(f.db.session).toHaveLength(0)
  })

  it('preserves state-cookie validation on the first callback', async () => {
    const f = await flow()
    f.jar.clear()
    const failure = await f.complete()
    expect(failure.headers.get('location')).toContain('error=state_mismatch')
    expect(f.exchange).not.toHaveBeenCalled()
    expect(failure.headers.getSetCookie().some((v) => v.includes('oauth_callback_result'))).toBe(
      false,
    )
  })

  it('does not store native deep links in the receipt', async () => {
    const f = await flow(true, 'example://admin')
    const success = await f.complete()
    expect(success.headers.get('location')).toStartWith('example://admin')
    expect(success.headers.getSetCookie().some((v) => v.includes('oauth_callback_result'))).toBe(
      false,
    )
  })
})
