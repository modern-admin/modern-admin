import { describe, expect, it } from 'bun:test'
import { DrizzleDatabase } from '../src/database.js'
import { createFakeClient } from './_helpers/fake-client.js'
import { schema } from './_helpers/schema.js'

describe('DrizzleDatabase', () => {
  it('detects a valid drizzle config', () => {
    expect(DrizzleDatabase.isAdapterFor({ client: createFakeClient(), schema })).toBe(true)
    expect(DrizzleDatabase.isAdapterFor({})).toBe(false)
    expect(DrizzleDatabase.isAdapterFor(null)).toBe(false)
  })

  it('throws when constructed with an invalid config', () => {
    expect(() => new DrizzleDatabase({ schema })).toThrow(/requires/)
  })

  it('produces one resource per table in schema', () => {
    const db = new DrizzleDatabase({ client: createFakeClient(), schema })
    const resources = db.resources()
    const ids = resources.map((r) => r.id())
    expect(ids).toContain('users')
    expect(ids).toContain('posts')
    expect(resources).toHaveLength(2)
  })

  it('honors per-table id overrides', () => {
    const db = new DrizzleDatabase({
      client: createFakeClient(),
      schema,
      resources: { users: { id: 'people' } },
    })
    const resources = db.resources()
    const userResource = resources.find((r) => r.id() === 'people')
    expect(userResource).toBeDefined()
  })
})
