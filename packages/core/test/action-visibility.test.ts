// `isVisible` — the UI half of action gating.
//
// Two distinct questions, deliberately answered in two places:
//
//   * "may this principal run it?"  → `isAccessible`, enforced by `invoke()`
//     and used to prune `ResourceJSON.actions`.
//   * "should this row offer it?"   → `isVisible`, a hint. Record actions
//     are resolved per record into `RecordJSON.recordActions`; resource and
//     bulk actions are resolved record-lessly at serialization time.
//
// The distinction matters: hiding an action must never be the only thing
// stopping an invoke, and a record-dependent predicate must not be evaluated
// without a record (that silently hid every "archive"-style action before).

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import type { ActionContext, ListActionResponse, RecordActionResponse } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as unknown as Adapter

const rows = [
  { id: '1', name: 'Ann', archived: false },
  { id: '2', name: 'Bob', archived: true },
]

const buildAdmin = (): ModernAdmin =>
  new ModernAdmin({
    adapters: [adapter],
    resources: [
      {
        resource: {
          name: 'users',
          rows: rows.map((r) => ({ ...r })),
          // `archived` has to be a declared property, otherwise the adapter
          // never serializes it and the predicates below see `undefined`.
          properties: [
            new BaseProperty({ path: 'id', isId: true, isSortable: true }),
            new BaseProperty({ path: 'name', type: 'string' }),
            new BaseProperty({ path: 'archived', type: 'boolean' }),
          ],
        },
        options: {
          actions: {
            // Mirror the classic pair: each row gets exactly one of them.
            archive: {
              name: 'archive',
              actionType: 'record' as const,
              isVisible: (ctx: ActionContext) => ctx.record?.params.archived !== true,
              handler: async () => ({}),
            },
            restore: {
              name: 'restore',
              actionType: 'record' as const,
              isVisible: (ctx: ActionContext) => ctx.record?.params.archived === true,
              handler: async () => ({}),
            },
            alwaysHidden: {
              name: 'alwaysHidden',
              actionType: 'record' as const,
              isVisible: false,
              handler: async () => ({}),
            },
            internalStats: {
              name: 'internalStats',
              actionType: 'resource' as const,
              isVisible: false,
              handler: async () => ({}),
            },
            sendMassPush: {
              name: 'sendMassPush',
              actionType: 'resource' as const,
              handler: async () => ({}),
            },
          },
        },
      },
    ],
  })

const listRecords = async (admin: ModernAdmin) => {
  const res = await admin.invoke<ListActionResponse>({
    params: { resourceId: 'users', action: 'list' },
    method: 'get',
  })
  return res.records
}

describe('per-record isVisible', () => {
  test('each row reports only the actions that apply to it', async () => {
    const records = await listRecords(buildAdmin())
    const byId = new Map(records.map((r) => [r.id, r.recordActions ?? []]))

    expect(byId.get('1')).toContain('archive')
    expect(byId.get('1')).not.toContain('restore')

    expect(byId.get('2')).toContain('restore')
    expect(byId.get('2')).not.toContain('archive')
  })

  test('a statically hidden record action is absent from every row', async () => {
    const records = await listRecords(buildAdmin())
    for (const record of records) {
      expect(record.recordActions).not.toContain('alwaysHidden')
    }
  })

  test('built-in record actions are reported as available', async () => {
    const records = await listRecords(buildAdmin())
    expect(records[0]?.recordActions).toEqual(
      expect.arrayContaining(['show', 'edit', 'delete']),
    )
  })

  test('resource- and bulk-scoped actions never leak into recordActions', async () => {
    const records = await listRecords(buildAdmin())
    expect(records[0]?.recordActions).not.toContain('sendMassPush')
    expect(records[0]?.recordActions).not.toContain('bulkDelete')
  })

  test('the show response is annotated too', async () => {
    const res = await buildAdmin().invoke<RecordActionResponse>({
      params: { resourceId: 'users', recordId: '2', action: 'show' },
      method: 'get',
    })
    expect(res.record.recordActions).toContain('restore')
    expect(res.record.recordActions).not.toContain('archive')
  })

  test('isVisible is a UI hint — a hidden action still runs', async () => {
    // The security boundary is `isAccessible`. If hiding also blocked
    // invocation, every contextual hide would become an accidental
    // authorization rule that `canAccess()` disagrees with.
    const admin = buildAdmin()
    await expect(
      admin.invoke({
        params: { resourceId: 'users', recordId: '1', action: 'alwaysHidden' },
        method: 'post',
      }),
    ).resolves.toBeDefined()
    expect(await admin.canAccess('users', 'alwaysHidden')).toBe(true)
  })

  test('a predicate keyed on a redacted property still sees the real value', async () => {
    // Property redaction runs on the way out; visibility is the app's own
    // logic. If annotation ran after the filter, `archived` would be gone by
    // the time the predicate looked and every row would report `archive`,
    // silently varying the menu by who is looking.
    const admin = new ModernAdmin({
      adapters: [adapter],
      resources: [
        {
          resource: {
            name: 'users',
            rows: rows.map((r) => ({ ...r })),
            properties: [
              new BaseProperty({ path: 'id', isId: true, isSortable: true }),
              new BaseProperty({ path: 'name', type: 'string' }),
              new BaseProperty({ path: 'archived', type: 'boolean' }),
            ],
          },
          options: {
            properties: { archived: { isAccessible: false } },
            actions: {
              archive: {
                name: 'archive',
                actionType: 'record' as const,
                isVisible: (ctx: ActionContext) => ctx.record?.params.archived !== true,
                handler: async () => ({}),
              },
            },
          },
        },
      ],
    })

    const records = await listRecords(admin)
    const byId = new Map(records.map((r) => [r.id, r]))
    // Redaction still happened…
    expect(byId.get('2')?.params.archived).toBeUndefined()
    // …but the verdict was formed before it.
    expect(byId.get('1')?.recordActions).toContain('archive')
    expect(byId.get('2')?.recordActions).not.toContain('archive')
  })

  test('an inaccessible record action is dropped from the row as well', async () => {
    const admin = buildAdmin()
    ;(
      admin.findResource('users').decorate().getAction('archive')!.merged as {
        isAccessible?: unknown
      }
    ).isAccessible = false

    const records = await listRecords(admin)
    expect(records[0]?.recordActions).not.toContain('archive')
  })
})

describe('record-less isVisible at serialization time', () => {
  const serialize = async (admin: ModernAdmin) => {
    const resource = admin.findResource('users')
    const json = await resource.decorate().toJSON({
      admin,
      resource,
      cache: admin.cache,
      cacheRuntime: admin.cacheRuntime,
    } as unknown as Parameters<ReturnType<typeof resource.decorate>['toJSON']>[0])
    return json.actions.map((a) => a.name)
  }

  test('hidden resource actions are pruned', async () => {
    const names = await serialize(buildAdmin())
    expect(names).not.toContain('internalStats')
    expect(names).toContain('sendMassPush')
  })

  test('the internal values/search actions stop being advertised', async () => {
    // Both are declared `isVisible: false` — they back comboboxes and the
    // global search box, and were previously shipped to the SPA as if they
    // were operator-facing menu entries.
    const names = await serialize(buildAdmin())
    expect(names).not.toContain('values')
    expect(names).not.toContain('search')
  })

  test('record actions stay in the list regardless of their predicate', async () => {
    // Their visibility is per-row and cannot be decided here — evaluating a
    // record-dependent predicate against an empty context would hide
    // `archive` from every row forever.
    const names = await serialize(buildAdmin())
    expect(names).toContain('archive')
    expect(names).toContain('restore')
  })
})
