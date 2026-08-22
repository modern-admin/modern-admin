// `ModernAdmin#toJSON()` has three call shapes and the difference between them
// is a security boundary, so each one is pinned here.
//
//   toJSON()            sync, unfiltered — trusted server-side callers only
//   toJSON(currentAdmin) filtered against that principal
//   toJSON(null)        filtered against *no* principal — the anonymous HTTP path
//
// The regression this guards against: the anonymous branch used to skip the
// isAccessible/isVisible resolution the authenticated branch performed, so a
// logged-out caller received strictly more than a low-privilege logged-in one.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import type { PropertyContext } from '../src/decorators/property-options.js'
import type { ActionContext } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter: Adapter = { Database: FakeDatabase, Resource: FakeResource }

const table = (): FakeTable => ({
  name: 'users',
  rows: [],
  properties: [
    new BaseProperty({ path: 'id', isId: true }),
    new BaseProperty({ path: 'email', type: 'string' }),
    new BaseProperty({ path: 'secret', type: 'string' }),
  ],
})

/** `secret` is readable only by an admin; `archive` is an admin-only action. */
const build = (): ModernAdmin =>
  new ModernAdmin({
    databases: [[table()]],
    adapters: [adapter],
    resources: [
      {
        resource: new FakeResource(table()),
        options: {
          properties: {
            secret: { isAccessible: (ctx: PropertyContext) => ctx.currentAdmin?.role === 'admin' },
          },
          actions: {
            archive: {
              actionType: 'resource',
              handler: async () => ({ records: [], meta: { total: 0, page: 1, perPage: 20 } }),
              isAccessible: (ctx: ActionContext) => ctx.currentAdmin?.role === 'admin',
            },
          },
        },
      },
    ],
  })

const resourceOf = (json: { resources: Array<{ id: string }> }): any =>
  json.resources.find((r) => r.id === 'users')

describe('ModernAdmin#toJSON access filtering', () => {
  test('toJSON() is synchronous and unfiltered', () => {
    const json = build().toJSON()
    // Not a promise — the sync overload is what trusted callers rely on.
    expect(json).not.toBeInstanceOf(Promise)
    const users = resourceOf(json)
    expect(users.properties.map((p: { path: string }) => p.path)).toContain('secret')
    expect(users.actions.map((a: { name: string }) => a.name)).toContain('archive')
  })

  test('toJSON(admin) keeps what that principal may see', async () => {
    const users = resourceOf(await build().toJSON({ id: '1', role: 'admin' }))
    expect(users.properties.map((p: { path: string }) => p.path)).toContain('secret')
    expect(users.actions.map((a: { name: string }) => a.name)).toContain('archive')
  })

  test('toJSON(admin) drops what that principal may not see', async () => {
    const users = resourceOf(await build().toJSON({ id: '2', role: 'viewer' }))
    expect(users.properties.map((p: { path: string }) => p.path)).not.toContain('secret')
    for (const paths of Object.values(users.propertyOrder) as string[][]) {
      expect(paths).not.toContain('secret')
    }
    expect(users.actions.map((a: { name: string }) => a.name)).not.toContain('archive')
  })

  test('toJSON(null) filters anonymously instead of returning everything', async () => {
    const users = resourceOf(await build().toJSON(null))
    expect(users.properties.map((p: { path: string }) => p.path)).not.toContain('secret')
    for (const paths of Object.values(users.propertyOrder) as string[][]) {
      expect(paths).not.toContain('secret')
    }
    expect(users.actions.map((a: { name: string }) => a.name)).not.toContain('archive')
  })

  test('filtered propertyOrder contains only paths present in properties', async () => {
    const users = resourceOf(await build().toJSON({ id: '2', role: 'viewer' }))
    const accessible = new Set(users.properties.map((p: { path: string }) => p.path))
    for (const paths of Object.values(users.propertyOrder) as string[][]) {
      expect(paths.every((path) => accessible.has(path))).toBe(true)
    }
  })

  test('an anonymous caller never sees more than a low-privilege one', async () => {
    const anon = resourceOf(await build().toJSON(null))
    const viewer = resourceOf(await build().toJSON({ id: '2', role: 'viewer' }))
    const paths = (r: { properties: Array<{ path: string }> }) => r.properties.map((p) => p.path)
    const names = (r: { actions: Array<{ name: string }> }) => r.actions.map((a) => a.name)
    for (const p of paths(anon)) expect(paths(viewer)).toContain(p)
    for (const a of names(anon)) expect(names(viewer)).toContain(a)
  })
})
