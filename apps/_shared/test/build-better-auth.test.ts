import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import type { ILogStore, ActionLogEntry } from '@modern-admin/core'
import { buildBetterAuth, setAuditLogStore, type BuildBetterAuthOptions } from '../src/index.js'

/**
 * `buildBetterAuth()` produces both a Better Auth instance and the raw
 * config object. The tests below introspect that config because directly
 * invoking the betterAuth runtime would require a real database — we
 * are only interested in the wiring decisions our factory makes (hook
 * installation, allowlist toggle, audit-log slot propagation).
 *
 * We still pass a real in-memory bun:sqlite handle so Better Auth's
 * lazy adapter init (kysely) doesn't reject asynchronously and pollute
 * the test runner with "unhandled error between tests" diagnostics.
 */

const makeDatabase = (): BuildBetterAuthOptions['database'] =>
  new Database(':memory:') as unknown as BuildBetterAuthOptions['database']

// In-memory log store that records every entry so the test can assert
// what the audit hook emitted.
class CapturingLogStore implements ILogStore {
  public readonly entries: ActionLogEntry[] = []

  async record(entry: ActionLogEntry): Promise<void> {
    this.entries.push(entry)
  }

  async list(): Promise<{ events: ActionLogEntry[] }> {
    return { events: [...this.entries] }
  }
}

describe('buildBetterAuth', () => {
  beforeEach(() => {
    // `buildBetterAuth` now requires a strong BETTER_AUTH_SECRET at startup.
    process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
    // Tests share the module-level `_auditLogStore` slot — reset to a
    // known state so order doesn't matter.
    setAuditLogStore(null)
  })

  afterEach(() => {
    delete process.env.BETTER_AUTH_SECRET
    setAuditLogStore(null)
  })

  test('throws when BETTER_AUTH_SECRET is missing or too weak', () => {
    delete process.env.BETTER_AUTH_SECRET
    expect(() => buildBetterAuth({ database: makeDatabase() })).toThrow(/BETTER_AUTH_SECRET/)
    process.env.BETTER_AUTH_SECRET = 'too-short'
    expect(() => buildBetterAuth({ database: makeDatabase() })).toThrow(/BETTER_AUTH_SECRET/)
  })

  test('enables api-key rate limiting and top-level rate limiting', () => {
    const { config } = buildBetterAuth({ database: makeDatabase() })
    expect(config.rateLimit?.enabled).toBe(true)
    expect(config.secret).toBeDefined()
  })

  test('always installs a session.create.after audit hook', () => {
    const { config } = buildBetterAuth({ database: makeDatabase() })
    expect(typeof config.databaseHooks?.session?.create?.after).toBe('function')
  })

  test('audit hook writes a login entry to the registered store', async () => {
    const store = new CapturingLogStore()
    setAuditLogStore(store)
    const { config } = buildBetterAuth({ database: makeDatabase() })
    const after = config.databaseHooks!.session!.create!.after!
    // The runtime calls this with the freshly-created session row.
    await after(
      { userId: 'u-1', id: 's-1' } as unknown as Parameters<typeof after>[0],
      {} as unknown as Parameters<typeof after>[1],
    )
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0]).toMatchObject({
      resourceId: '__auth__',
      action: 'login',
      userId: 'u-1',
    })
    expect(typeof store.entries[0]!.id).toBe('string')
    expect(typeof store.entries[0]!.at).toBe('number')
  })

  test('audit hook is a no-op when no store is registered', async () => {
    const { config } = buildBetterAuth({ database: makeDatabase() })
    const after = config.databaseHooks!.session!.create!.after!
    // Should resolve without throwing even though no store is set.
    await expect(after({ userId: 'u-1', id: 's-1' } as unknown as Parameters<typeof after>[0], {} as unknown as Parameters<typeof after>[1])).resolves.toBeUndefined()
  })

  test('audit hook swallows store errors so logins are never blocked', async () => {
    setAuditLogStore({
      async record() {
        throw new Error('boom')
      },
      async list() {
        return { events: [] }
      },
    })
    const { config } = buildBetterAuth({ database: makeDatabase() })
    const after = config.databaseHooks!.session!.create!.after!
    await expect(after({ userId: 'u-1', id: 's-1' } as unknown as Parameters<typeof after>[0], {} as unknown as Parameters<typeof after>[1])).resolves.toBeUndefined()
  })

  test('allowlistOnly: false leaves sign-up enabled and no user.create.before hook', () => {
    const { config } = buildBetterAuth({ database: makeDatabase() })
    expect(config.emailAndPassword?.disableSignUp).toBeUndefined()
    expect(config.databaseHooks?.user).toBeUndefined()
    expect(config.account?.accountLinking).toBeUndefined()
  })

  test('allowlistOnly: true disables sign-up and installs user.create.before that throws', async () => {
    const { config } = buildBetterAuth({ database: makeDatabase(), allowlistOnly: true })
    expect(config.emailAndPassword?.disableSignUp).toBe(true)
    expect(config.account?.accountLinking?.enabled).toBe(true)
    const before = config.databaseHooks!.user!.create!.before!
    await expect(before({ email: 'unknown@example.com' } as unknown as Parameters<typeof before>[0], {} as unknown as Parameters<typeof before>[1])).rejects.toThrow(
      /Sign-up is disabled/,
    )
  })

  test('allowlistOnly defaults trustedProviders to every active social provider', () => {
    process.env.GITHUB_CLIENT_ID = 'gh-id'
    process.env.GITHUB_CLIENT_SECRET = 'gh-secret'
    process.env.GOOGLE_CLIENT_ID = 'go-id'
    process.env.GOOGLE_CLIENT_SECRET = 'go-secret'
    try {
      const { config } = buildBetterAuth({ database: makeDatabase(), allowlistOnly: true })
      expect(config.account?.accountLinking?.trustedProviders).toEqual(['github', 'google'])
    } finally {
      delete process.env.GITHUB_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
    }
  })

  test('oauthTrustedProviders override wins over the default', () => {
    process.env.GITHUB_CLIENT_ID = 'gh-id'
    process.env.GITHUB_CLIENT_SECRET = 'gh-secret'
    try {
      const { config } = buildBetterAuth({
        database: makeDatabase(),
        allowlistOnly: true,
        oauthTrustedProviders: ['google'],
      })
      expect(config.account?.accountLinking?.trustedProviders).toEqual(['google'])
    } finally {
      delete process.env.GITHUB_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET
    }
  })
})
