import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { admin } from 'better-auth/plugins'
import { betterAuth } from 'better-auth'
import { apiKey } from '@better-auth/api-key'
import { BetterAuthProvider, type ApiKeyAdminApi } from '@modern-admin/auth-better-auth'
import { createBetterAuthMiddleware } from '@modern-admin/nest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildBetterAuth, migrateAuth, seedDemoUser, type BuildBetterAuthOptions } from '../src'

describe('Better Auth 1.7 runtime contract', () => {
  let database: Database

  beforeEach(() => {
    database = new Database(':memory:')
    process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
    process.env.DEMO_ADMIN_EMAIL = 'admin@example.com'
    process.env.DEMO_ADMIN_PASSWORD = 'admin12345'
    process.env.DEMO_ADMIN_NAME = 'Demo Admin'
  })

  afterEach(() => {
    database.close()
    delete process.env.BETTER_AUTH_SECRET
    delete process.env.DEMO_ADMIN_EMAIL
    delete process.env.DEMO_ADMIN_PASSWORD
    delete process.env.DEMO_ADMIN_NAME
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
  })

  test('concurrent seeds create one complete credential identity that can sign in', async () => {
    const { auth, config } = buildBetterAuth({
      database: database as unknown as BuildBetterAuthOptions['database'],
      extraPlugins: [admin({ defaultRole: 'admin' })],
    })
    await migrateAuth(config)

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        seedDemoUser({ auth, label: `better-auth-1.7-test-${index}` }),
      ),
    )

    const users = database.query('SELECT id, role FROM ma_user').all() as Array<{
      id: string
      role: string | null
    }>
    const accounts = database
      .query('SELECT providerId, issuer, accountId, userId, password FROM ma_account')
      .all() as Array<{
      providerId: string
      issuer: string
      accountId: string
      userId: string
      password: string | null
    }>

    expect(users).toHaveLength(1)
    expect(users[0]!.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    expect(users[0]!.role).toBe('admin')
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({
      providerId: 'credential',
      issuer: 'local:credential',
      accountId: users[0]!.id,
      userId: users[0]!.id,
    })
    expect(accounts[0]!.password).toBeTruthy()

    const result = await auth.api.signInEmail({
      body: { email: 'admin@example.com', password: 'admin12345' },
    })
    expect(result.user.id).toBe(users[0]!.id)
    expect(result.user.role).toBe('admin')
    expect(database.query('SELECT count(*) AS count FROM ma_session').get()).toMatchObject({
      count: 2,
    })
  })

  test('the reference expiry ceiling accepts seconds for one day through 3650 days', async () => {
    const { auth, config } = buildBetterAuth({
      database: database as unknown as BuildBetterAuthOptions['database'],
    })
    await migrateAuth(config)
    await seedDemoUser({ auth, label: 'api-key-expiry-contract' })
    const user = database.query('SELECT id FROM ma_user').get() as { id: string }
    const api = auth.api as unknown as ApiKeyAdminApi
    for (const days of [1, 3650]) {
      const seconds = days * 24 * 60 * 60
      const before = Date.now()
      const created = await api.createApiKey({
        body: { userId: user.id, name: `expiry-${days}`, expiresIn: seconds },
      })
      expect(new Date(created.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + seconds * 1000)
      const updated = await api.updateApiKey({
        body: { userId: user.id, keyId: created.id, expiresIn: seconds },
      })
      expect(new Date(updated.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + seconds * 1000)
    }
    await expect(
      api.createApiKey({
        body: { userId: user.id, name: 'over-limit', expiresIn: 3651 * 24 * 60 * 60 },
      }),
    ).rejects.toMatchObject({ body: { code: 'EXPIRES_IN_IS_TOO_LARGE' } })
  })

  test.each(['header', 'getter'] as const)(
    'real plugin %s cannot bypass provider or middleware scope through mismatched headers',
    async (mode) => {
      const { config } = buildBetterAuth({
        database: database as unknown as BuildBetterAuthOptions['database'],
        extraPlugins: [admin({ defaultRole: 'admin' })],
      })
      const plugin = apiKey({
        apiKeyHeaders: ['x-private-key', 'x-second-key'],
        ...(mode === 'getter'
          ? {
              customAPIKeyGetter: (ctx) =>
                ctx.headers?.get('authorization')?.replace(/^Bearer /, '') ?? null,
            }
          : {}),
        enableSessionForAPIKeys: true,
        rateLimit: { enabled: true, maxRequests: 10, timeWindow: 60_000 },
        schema: { apikey: { modelName: 'ma_apikey' } },
      })
      config.plugins = [...config.plugins!.filter((item) => item.id !== 'api-key'), plugin]
      const auth = betterAuth(config)
      await migrateAuth(config)
      await seedDemoUser({ auth, label: `api-key-custom-${mode}` })
      const signIn = await auth.api.signInEmail({
        body: { email: 'admin@example.com', password: 'admin12345' },
        returnHeaders: true,
      })
      const cookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(';', 1)[0])
        .join('; ')
      const key = await (auth.api as unknown as ApiKeyAdminApi).createApiKey({
        body: {
          userId: signIn.response.user.id,
          name: 'scoped',
          permissions: { payments: ['list'] },
        },
      })
      const keyHeaders =
        mode === 'getter' ? { authorization: `Bearer ${key.key}` } : { 'x-second-key': key.key }
      const provider = new BetterAuthProvider({ auth, apiKeyHeaders: ['x-unrelated'] })
      for (const headers of [keyHeaders, { ...keyHeaders, cookie }]) {
        const principal = await provider.getCurrentUser({ headers })
        expect(principal?.apiKey).toMatchObject({ id: key.id, permissions: { payments: ['list'] } })
      }
      // Extracting credentials for detection must not consume rate-limit slots.
      expect(database.query('SELECT requestCount FROM ma_apikey WHERE id = ?').get(key.id)).toEqual(
        { requestCount: 2 },
      )
      expect((await provider.getCurrentUser({ headers: { cookie } }))?.apiKey).toBeUndefined()
      expect((await provider.getCurrentUser({ headers: { cookie } }))?.id).toBe(
        signIn.response.user.id,
      )

      let handled = false
      const middleware = createBetterAuthMiddleware(
        () => {
          handled = true
        },
        { auth, apiKeyHeaders: ['x-unrelated'] },
      )
      for (const path of ['/get-session', '/list-sessions', '/api-key/create']) {
        let status = 200
        const res = {
          statusCode: 200,
          setHeader: () => {},
          end() {
            status = this.statusCode
          },
        }
        await middleware(
          { url: path, headers: keyHeaders } as IncomingMessage,
          res as unknown as ServerResponse,
          (err) => {
            throw err ?? new Error('unexpected next')
          },
        )
        expect(status).toBe(403)
        expect(handled).toBe(false)
      }
      expect(database.query('SELECT requestCount FROM ma_apikey WHERE id = ?').get(key.id)).toEqual(
        { requestCount: 2 },
      )
    },
  )

  test('linked accounts can list, refresh tokens, and unlink without losing the admin session', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
    const { auth, config } = buildBetterAuth({
      database: database as unknown as BuildBetterAuthOptions['database'],
      extraPlugins: [admin({ defaultRole: 'admin' })],
    })
    await migrateAuth(config)
    await seedDemoUser({ auth, label: 'better-auth-1.7-account-lifecycle' })

    const signIn = await auth.api.signInEmail({
      body: { email: 'admin@example.com', password: 'admin12345' },
      returnHeaders: true,
    })
    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';', 1)[0])
      .join('; ')
    const sessionHeaders = new Headers({ cookie })
    const context = await auth.$context
    const googleAccount = await context.internalAdapter.linkAccount({
      providerId: 'google',
      issuer: 'https://untrusted.example',
      accountId: 'google-subject-1',
      userId: signIn.response.user.id,
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
    })
    expect(
      database.query('SELECT issuer FROM ma_account WHERE id = ?').get(googleAccount.id),
    ).toEqual({ issuer: 'https://accounts.google.com' })
    await expect(
      context.internalAdapter.linkAccount({
        providerId: 'unknown-provider',
        accountId: 'unknown-subject',
        userId: signIn.response.user.id,
      }),
    ).rejects.toThrow('Unknown Better Auth account provider')

    const linked = await auth.api.listUserAccounts({ headers: sessionHeaders })
    expect(linked).toHaveLength(2)
    expect(linked.find(({ id }) => id === googleAccount.id)).toMatchObject({
      providerId: 'google',
      issuer: 'https://accounts.google.com',
      accountId: 'google-subject-1',
      userId: signIn.response.user.id,
    })

    const googleProvider = context.socialProviders.find(({ id }) => id === 'google')
    expect(googleProvider).toBeTruthy()
    googleProvider!.refreshAccessToken = async (refreshToken) => {
      expect(refreshToken).toBe('old-refresh-token')
      return {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
      }
    }
    const refreshed = await auth.api.refreshToken({
      body: { accountId: googleAccount.id, userId: signIn.response.user.id },
    })
    expect(refreshed).toMatchObject({
      providerId: 'google',
      accountId: googleAccount.id,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    })
    expect(
      database
        .query('SELECT accessToken, refreshToken FROM ma_account WHERE id = ?')
        .get(googleAccount.id),
    ).toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    })

    expect(
      await auth.api.unlinkAccount({
        headers: sessionHeaders,
        body: { accountId: googleAccount.id },
      }),
    ).toEqual({ status: true })
    expect(await auth.api.listUserAccounts({ headers: sessionHeaders })).toHaveLength(1)
    expect(await auth.api.getSession({ headers: sessionHeaders })).toMatchObject({
      user: { id: signIn.response.user.id, role: 'admin' },
    })
  })
})
