// Smoke tests for `@modern-admin/system-drizzle`.
//
// Drizzle's typed `db` is hard to mock end-to-end without standing up a
// real (or pglite) Postgres instance — and we deliberately avoid pulling
// either into the unit suite. These tests only verify:
//   - `setupDrizzleSystem` constructs all six stores
//   - each store carries the table reference it was wired with
//   - basic happy-path inserts forward the expected payload
//
// Behavioural parity with the Prisma adapter (filters, upsert semantics,
// expiry, tag invalidation, …) is covered by the integration test
// suite in `apps/api-prisma`/`apps/api-drizzle` once those exist, and by
// the Prisma-side tests in `packages/system-prisma/test/stores.test.ts`
// which exercise the same logic on the same Zod entry shapes.

import { describe, expect, it } from 'bun:test'
import { setupDrizzleSystem } from '../src/index.js'
import { systemTables } from '../src/schema/pg.js'

interface Call { method: string; args: unknown[] }

function fakeDb(): { calls: Call[]; db: any } {
  const calls: Call[] = []
  // Each builder method returns `this` and resolves to `[]` when awaited,
  // so chains like .insert(t).values(v).returning() complete without
  // actually executing SQL. Real behaviour is covered elsewhere; here we
  // only assert the shape of the call.
  const chain: any = new Proxy(function () {}, {
    get(_, prop) {
      // any prop access returns the same chain proxy so .where().orderBy()
      // .limit().offset() all keep going.
      if (prop === 'then') {
        // make awaiting the chain resolve to []
        return (resolve: (v: unknown) => unknown) => resolve([])
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return chain
      }
    },
    apply() { return chain },
  })
  const db: any = {
    insert: (t: unknown) => { calls.push({ method: 'insert', args: [t] }); return chain },
    select: (f?: unknown) => { calls.push({ method: 'select', args: f === undefined ? [] : [f] }); return chain },
    update: (t: unknown) => { calls.push({ method: 'update', args: [t] }); return chain },
    delete: (t: unknown) => { calls.push({ method: 'delete', args: [t] }); return chain },
  }
  return { calls, db }
}

describe('setupDrizzleSystem', () => {
  it('constructs all six stores', () => {
    const { db } = fakeDb()
    const sys = setupDrizzleSystem(db, systemTables)
    expect(sys.logStore).toBeDefined()
    expect(sys.webhookStore).toBeDefined()
    expect(sys.configStore).toBeDefined()
    expect(sys.historyStore).toBeDefined()
    expect(sys.aiTaskStore).toBeDefined()
    expect(sys.cacheStore).toBeDefined()
  })

  it('exposes every store as part of ISystemStores', () => {
    const { db } = fakeDb()
    const sys = setupDrizzleSystem(db, systemTables)
    // Compile-time check via runtime keys.
    const keys: (keyof typeof sys)[] = [
      'logStore', 'webhookStore', 'configStore',
      'historyStore', 'aiTaskStore', 'cacheStore',
    ]
    for (const k of keys) expect(sys[k]).toBeTruthy()
  })
})

describe('DrizzleLogStore.record', () => {
  it('forwards the entry to db.insert(maLog).values(...)', async () => {
    const { calls, db } = fakeDb()
    const { logStore } = setupDrizzleSystem(db, systemTables)
    await logStore.record({
      resourceId: 'users',
      action: 'new',
      recordId: '1',
      at: 1234567890,
    })
    const insert = calls.find((c) => c.method === 'insert')
    const values = calls.find((c) => c.method === 'values')
    expect(insert).toBeTruthy()
    expect(insert!.args[0]).toBe(systemTables.maLog)
    expect(values?.args[0]).toMatchObject({
      resourceId: 'users',
      action: 'new',
      recordId: '1',
      at: 1234567890,
    })
  })
})

describe('DrizzleConfigStore.set', () => {
  it('uses insert + onConflictDoUpdate for upsert semantics', async () => {
    const { calls, db } = fakeDb()
    const { configStore } = setupDrizzleSystem(db, systemTables)
    await configStore.set('global', null, 'theme', 'dark')
    expect(calls.some((c) => c.method === 'insert')).toBe(true)
    expect(calls.some((c) => c.method === 'onConflictDoUpdate')).toBe(true)
  })
})

describe('DrizzleCacheStore.set', () => {
  it('uses insert + onConflictDoUpdate', async () => {
    const { calls, db } = fakeDb()
    const { cacheStore } = setupDrizzleSystem(db, systemTables)
    await cacheStore.set('k', 1, { ttlMs: 1000, tags: ['t'] })
    expect(calls.some((c) => c.method === 'insert')).toBe(true)
    expect(calls.some((c) => c.method === 'onConflictDoUpdate')).toBe(true)
  })
})

describe('schema/pg', () => {
  it('exports all expected system tables', () => {
    expect(systemTables.maLog).toBeDefined()
    expect(systemTables.maWebhook).toBeDefined()
    expect(systemTables.maWebhookDelivery).toBeDefined()
    expect(systemTables.maConfig).toBeDefined()
    expect(systemTables.maHistory).toBeDefined()
    expect(systemTables.maAiTask).toBeDefined()
    expect(systemTables.maAiTaskEvent).toBeDefined()
    expect(systemTables.maCache).toBeDefined()
  })
})
