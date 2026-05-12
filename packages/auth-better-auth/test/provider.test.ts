import { describe, expect, test } from 'bun:test'
import { type ApiKeyCreated, BetterAuthProvider } from '../src/index.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeAuth = (overrides: Partial<{
  user: unknown
  signInEmail: () => Promise<void>
  signOut: () => Promise<void>
  createApiKey: (args: { body: Record<string, unknown>; headers: Headers }) => Promise<ApiKeyCreated>
  listApiKeys: (args: { headers: Headers }) => Promise<unknown>
  updateApiKey: (args: { body: Record<string, unknown>; headers?: Headers }) => Promise<unknown>
  deleteApiKey: (args: { body: { keyId: string }; headers: Headers }) => Promise<{ success: boolean }>
}> = {}) => ({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
