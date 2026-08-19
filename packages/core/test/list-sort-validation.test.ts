// `isSortable` used to be a UI hint only: `sortBy` travelled from the query
// string into the adapter's `orderBy` untouched, so `?sortBy=passwordHash` or
// the name of a relation reached the ORM and came back as a 500 naming an
// internal column. The list action now rejects anything the resource does not
// advertise as sortable — and the set it checks has to be exactly the set the
// wire payload exposes, or the SPA renders headers that 400 when clicked.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import { ValidationError } from '../src/errors'
import type { ActionRequest, ListActionResponse } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter: Adapter = { Database: FakeDatabase, Resource: FakeResource }

const table = (): FakeTable => ({
  name: 'users',
  rows: [{ id: '1', email: 'a@b.c' }],
  properties: [
    new BaseProperty({ path: 'id', isId: true, isSortable: true }),
    new BaseProperty({ path: 'email', type: 'string', isSortable: true }),
    new BaseProperty({ path: 'avatar', type: 'string', isSortable: false }),
  ],
})

const build = (): ModernAdmin =>
  new ModernAdmin({
    databases: [[table()]],
    adapters: [adapter],
    // `password` exists only as an options entry — a form-only virtual field
    // with no column behind it.
    resources: [
      {
        resource: new FakeResource(table()),
        options: { properties: { password: { type: 'password' } } },
      },
    ],
  })

const listReq = (query: Record<string, unknown> = {}): ActionRequest => ({
  params: { resourceId: 'users', action: 'list' },
  method: 'get',
  query,
})

const list = (admin: ModernAdmin, query: Record<string, unknown>) =>
  admin.invoke<ListActionResponse>(listReq(query))

describe('list action sortBy validation', () => {
  test('accepts a sortable column', async () => {
    const res = await list(build(), { sortBy: 'email' })
    expect(res.meta.sortBy).toBe('email')
  })

  test('rejects a column declared isSortable: false', async () => {
    await expect(list(build(), { sortBy: 'avatar' })).rejects.toBeInstanceOf(ValidationError)
  })

  test('rejects an unknown column instead of passing it to the adapter', async () => {
    await expect(list(build(), { sortBy: 'passwordHash' })).rejects.toBeInstanceOf(ValidationError)
  })

  test('rejects a virtual, form-only property', async () => {
    // It has no column to order by; `BaseProperty` defaults `isSortable` to
    // true, so this only holds because virtual fields are built with it off.
    await expect(list(build(), { sortBy: 'password' })).rejects.toBeInstanceOf(ValidationError)
  })

  test('the wire payload never advertises a column the guard would reject', async () => {
    const json = build().toJSON()
    const users = json.resources.find((r) => r.id === 'users')!
    for (const property of users.properties) {
      if (!property.isSortable) continue
      const res = await list(build(), { sortBy: property.path })
      expect(res.meta.sortBy).toBe(property.path)
    }
  })

  test('an empty sortBy is treated as absent, not as an invalid column', async () => {
    // `?sortBy=` reaches core as '' — the Nest DTO types it `z.string()`.
    const res = await list(build(), { sortBy: '' })
    expect(res.meta.sortBy).toBeUndefined()
  })

  test('non-numeric paging falls back instead of producing NaN offsets', async () => {
    const res = await list(build(), { page: 'x', perPage: 'y' })
    expect(res.meta.page).toBe(1)
    expect(res.meta.perPage).toBe(20)
  })
})
