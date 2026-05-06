import { describe, expect, test } from 'bun:test'
import { BetterAuthProvider } from '../src/index.js'

const fakeAuth = (overrides: Partial<{ user: unknown; signInEmail: () => Promise<void>; signOut: () => Promise<void> }> = {}) => ({
  api: {
    async getSession({ headers }: { headers: Headers }) {
      const cookie = headers.get('cookie')
      if (cookie === 'valid' && overrides.user) {
        return { user: overrides.user as { id: string }, session: { id: 's1' } }
      }
      return null
    },
    signInEmail: overrides.signInEmail,
    signOut: overrides.signOut,
  },
  options: {
    socialProviders: { github: {} },
    emailAndPassword: { enabled: true },
  },
})

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
})
