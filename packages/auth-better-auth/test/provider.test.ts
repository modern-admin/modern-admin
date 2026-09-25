import { describe, expect, test } from 'bun:test'
import { type ApiKeyCreated, BetterAuthProvider } from '../src/index.js'

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const fakeAuth = (
  overrides: Partial<{
    user: unknown
    signInEmail: () => Promise<void>
    signOut: () => Promise<void>
    createApiKey: (args: {
      body: Record<string, unknown>
      headers: Headers
    }) => Promise<ApiKeyCreated>
    listApiKeys: (args: { headers: Headers }) => Promise<unknown>
    updateApiKey: (args: { body: Record<string, unknown>; headers?: Headers }) => Promise<unknown>
    deleteApiKey: (args: {
      body: { keyId: string }
      headers: Headers
    }) => Promise<{ success: boolean }>
  }> = {},
) =>
  ({
    api: {
      async getSession({ headers }: { headers: Headers }) {
        const cookie = headers.get('cookie')
        if (cookie === 'valid' && overrides.user) {
          return { user: overrides.user as { id: string }, session: { id: 's1' } }
        }
        return null
      },
      createApiKey:
        overrides.createApiKey ??
        (async () => ({
          id: 'k1',
          key: 'secret',
          name: null,
          start: null,
          prefix: null,
          enabled: true,
          permissions: {},
          expiresAt: null,
          lastRequest: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      listApiKeys: overrides.listApiKeys ?? (async () => []),
      updateApiKey: overrides.updateApiKey ?? (async () => ({ id: 'k1' })),
      deleteApiKey: overrides.deleteApiKey ?? (async () => ({ success: true })),
      signInEmail: overrides.signInEmail,
      signOut: overrides.signOut,
    },
    options: {
      socialProviders: { github: {} },
      emailAndPassword: { enabled: true },
    },
  }) as any

describe('BetterAuthProvider', () => {
  test('getUiProps surfaces enabled providers', () => {
    const provider = new BetterAuthProvider({ auth: fakeAuth() })
    expect(provider.getUiProps()).toEqual({
      providers: ['github'],
      emailAndPassword: true,
    })
  })

  test('getCurrentUser resolves session into CurrentAdmin', async () => {
    const provider = new BetterAuthProvider({
      auth: fakeAuth({ user: { id: 'u1', email: 'a@b', name: 'Ann', image: 'x.png' } }),
    })
    const result = await provider.getCurrentUser({ headers: { cookie: 'valid' } })
    expect(result).toEqual({ id: 'u1', email: 'a@b', name: 'Ann', avatarUrl: 'x.png' })
  })

  test('getCurrentUser returns null when session is missing', async () => {
    const provider = new BetterAuthProvider({ auth: fakeAuth() })
    expect(await provider.getCurrentUser({ headers: {} })).toBeNull()
  })

  test('login fails fast without credentials', async () => {
    const provider = new BetterAuthProvider({ auth: fakeAuth() })
    expect(await provider.login({})).toBeNull()
  })

  test('logout calls signOut when available', async () => {
    let called = false
    const provider = new BetterAuthProvider({
      auth: fakeAuth({
        signOut: async () => {
          called = true
        },
      }),
    })
    await provider.logout({ headers: { cookie: 'valid' } })
    expect(called).toBe(true)
  })

  test('seedAdmin assigns the requested role through Better Auth setRole', async () => {
    const calls: Array<{ body: { userId: string; role: string }; headers?: Headers }> = []
    const headers = new Headers({ cookie: 'seed-session' })
    const provider = new BetterAuthProvider({
      auth: {
        api: {
          signUpEmail: async () => ({ user: { id: 'new-user' } }),
          setRole: async (args: { body: { userId: string; role: string }; headers?: Headers }) => {
            calls.push(args)
          },
        },
      },
      logger: silentLogger,
      seedAdminHeaders: headers,
    })

    await provider.seedAdmin({
      email: 'root@example.test',
      password: 'correct horse battery staple',
      role: 'root',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toEqual({ userId: 'new-user', role: 'root' })
    expect(calls[0]?.headers).toBe(headers)
  })

  test('seedAdmin reconciles the role of an existing account through setRole', async () => {
    const calls: Array<{ body: { userId: string; role: string } }> = []
    const provider = new BetterAuthProvider({
      auth: {
        api: {
          signUpEmail: async () => {
            throw { body: { code: 'USER_ALREADY_EXISTS' } }
          },
          listUsers: async () => ({ users: [{ id: 'existing-user' }] }),
          setRole: async (args: { body: { userId: string; role: string } }) => {
            calls.push(args)
          },
        },
      },
      logger: silentLogger,
      seedAdminHeaders: new Headers({ cookie: 'seed-session' }),
    })

    await provider.seedAdmin({
      email: 'root@example.test',
      password: 'correct horse battery staple',
      role: 'admin',
    })

    expect(calls.map((call) => call.body)).toEqual([{ userId: 'existing-user', role: 'admin' }])
  })

  test('getApiKeyAdmin createApiKey resolves session user and passes userId', async () => {
    let received: { body: Record<string, unknown>; headers: Headers } | undefined
    const provider = new BetterAuthProvider({
      auth: fakeAuth({
        user: { id: 'u1', email: 'a@b' },
        createApiKey: async (args) => {
          received = args
          return {
            id: 'k1',
            key: 'secret',
            name: 'CI',
            start: null,
            prefix: null,
            enabled: true,
            permissions: { users: ['list'] },
            expiresAt: null,
            lastRequest: null,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            updatedAt: new Date('2025-01-01T00:00:00Z'),
          }
        },
      }),
    })
    const api = provider.getApiKeyAdmin()
    expect(api).not.toBeNull()
    await api!.createApiKey({
      headers: new Headers({ cookie: 'valid' }),
      body: { name: 'CI', permissions: { users: ['list'] } },
    })
    expect(received).toBeDefined()
    expect(received!.body).toEqual({
      name: 'CI',
      permissions: { users: ['list'] },
      userId: 'u1',
    })
  })

  test('getApiKeyAdmin createApiKey throws when session is missing', async () => {
    const provider = new BetterAuthProvider({
      auth: fakeAuth({
        createApiKey: async () => {
          throw new Error('should not be called')
        },
      }),
    })
    const api = provider.getApiKeyAdmin()
    expect(api).not.toBeNull()
    await expect(
      api!.createApiKey({
        headers: new Headers(),
        body: { name: 'CI', permissions: { users: ['list'] } },
      }),
    ).rejects.toThrow('Not authenticated')
  })

  test('getApiKeyAdmin updateApiKey resolves session user and passes userId for server-only fields', async () => {
    let received: { body: Record<string, unknown>; headers?: Headers } | undefined
    const provider = new BetterAuthProvider({
      auth: fakeAuth({
        user: { id: 'u1', email: 'a@b' },
        updateApiKey: async (args) => {
          received = args
          return {
            id: 'k1',
            name: 'CI',
            start: null,
            prefix: null,
            enabled: false,
            permissions: { users: ['list'] },
            expiresAt: null,
            lastRequest: null,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            updatedAt: new Date('2025-01-01T00:00:00Z'),
          }
        },
      }),
    })
    const api = provider.getApiKeyAdmin()
    expect(api).not.toBeNull()
    await api!.updateApiKey({
      headers: new Headers({ cookie: 'valid' }),
      body: { keyId: 'k1', enabled: false, permissions: { users: ['list'] } },
    })
    expect(received).toBeDefined()
    expect(received!.body).toEqual({
      keyId: 'k1',
      enabled: false,
      permissions: { users: ['list'] },
      userId: 'u1',
    })
    expect(received!.headers).toBeUndefined()
  })
})

// Better Auth's api-key plugin turns `x-api-key` into a session of the key's
// *owner* (`session.id = apiKey.id`, `userId = apiKey.referenceId`). The
// provider must either attach the key's scope or reject the request — a
// principal without the `apiKey` claim carries the owner's full role.
describe('BetterAuthProvider — API-key requests', () => {
  const owner = { id: 'u1', email: 'root@example.com', role: 'admin' }
  const keyRow = {
    id: 'k1',
    name: 'payments-ro',
    referenceId: 'u1',
    enabled: true,
    expiresAt: null,
    permissions: { payments: ['list'] },
  }
  type VerifyResult = {
    valid: boolean
    error: { code: string } | null
    key: typeof keyRow | null
  }

  const keyAuth = (
    opts: {
      verify?: (key: string) => Promise<VerifyResult>
      sessionId?: string
      header?: string
    } = {},
  ) =>
    ({
      api: {
        async getSession({ headers }: { headers: Headers }) {
          if (!headers.get(opts.header ?? 'x-api-key')) return null
          return { user: owner, session: { id: opts.sessionId ?? keyRow.id } }
        },
        ...(opts.verify
          ? { verifyApiKey: ({ body }: { body: { key: string } }) => opts.verify!(body.key) }
          : {}),
      },
    }) as any

  const valid = async (): Promise<VerifyResult> => ({ valid: true, error: null, key: keyRow })

  test('a verified key is attached as the principal scope', async () => {
    const provider = new BetterAuthProvider({
      auth: keyAuth({ verify: valid }),
      logger: silentLogger,
    })
    const principal = await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })
    expect(principal).toEqual({
      id: 'u1',
      email: 'root@example.com',
      role: 'admin',
      apiKey: { id: 'k1', name: 'payments-ro', permissions: { payments: ['list'] } },
    })
  })

  test('a key with no permissions gets an empty allowlist, not the owner role', async () => {
    const provider = new BetterAuthProvider({
      auth: keyAuth({
        verify: async () => ({
          ...(await valid()),
          key: { ...keyRow, permissions: null as never },
        }),
      }),
      logger: silentLogger,
    })
    const principal = await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })
    expect(principal?.apiKey).toEqual({ id: 'k1', name: 'payments-ro', permissions: {} })
  })

  test('verification that throws rejects the request', async () => {
    const provider = new BetterAuthProvider({
      auth: keyAuth({
        verify: async () => {
          throw new Error('db down')
        },
      }),
      logger: silentLogger,
    })
    expect(await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })).toBeNull()
  })

  test('verification that reports invalid (rate limit, quota) rejects the request', async () => {
    const provider = new BetterAuthProvider({
      auth: keyAuth({
        verify: async () => ({ valid: false, error: { code: 'RATE_LIMITED' }, key: null }),
      }),
      logger: silentLogger,
    })
    expect(await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })).toBeNull()
  })

  test('no verifyApiKey on the instance rejects a key request', async () => {
    const provider = new BetterAuthProvider({ auth: keyAuth(), logger: silentLogger })
    expect(await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })).toBeNull()
  })

  test('a key that is not the one the session was minted from is rejected', async () => {
    const provider = new BetterAuthProvider({
      auth: keyAuth({ verify: valid, sessionId: 'browser-session' }),
      logger: silentLogger,
    })
    expect(await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })).toBeNull()
  })

  test('a key owned by someone other than the session user is rejected', async () => {
    const provider = new BetterAuthProvider({
      auth: keyAuth({
        verify: async () => ({ ...(await valid()), key: { ...keyRow, referenceId: 'u2' } }),
      }),
      logger: silentLogger,
    })
    expect(await provider.getCurrentUser({ headers: { 'x-api-key': 'secret' } })).toBeNull()
  })

  test('custom apiKeyHeaders are the ones checked', async () => {
    const seen: string[] = []
    const provider = new BetterAuthProvider({
      auth: keyAuth({
        header: 'x-service-token',
        verify: async (key) => {
          seen.push(key)
          return valid()
        },
      }),
      logger: silentLogger,
      apiKeyHeaders: ['x-service-token'],
    })
    const principal = await provider.getCurrentUser({ headers: { 'x-service-token': 'tok' } })
    expect(seen).toEqual(['tok'])
    expect(principal?.apiKey).toMatchObject({ id: 'k1' })
  })
})
