// What the UI is *told* it may do has to match what `invoke()` will accept.
//
// `isAccessible` was already resolved when serializing the config snapshot and
// when annotating per-record actions, but the two principal gates — the
// api-key allowlist and the role matrix — ran only inside `invoke()`. A
// `viewer` role therefore received `new`/`edit`/`delete` descriptors, the SPA
// rendered the matching buttons, and every click came back 403.
//
// These tests pin the gates at both wire surfaces: `ResourceJSON.actions`
// (resource + bulk + record descriptors) and `RecordJSON.recordActions`.

import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '../src/modern-admin.js'
import { BaseProperty } from '../src/adapters/base-property.js'
import { ForbiddenError } from '../src/errors'
import type { ListActionResponse } from '../src/actions'
import type { Adapter } from '../src/factories/resources-factory.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter: Adapter = { Database: FakeDatabase, Resource: FakeResource }

const users = (): FakeTable => ({
  name: 'users',
  rows: [{ id: '1', name: 'Ann' }],
  properties: [
    new BaseProperty({ path: 'id', isId: true, isSortable: true }),
    new BaseProperty({ path: 'name', type: 'string' }),
  ],
})

/** Roles resource backing `rolesResourceId`, shaped like `ma_role`. */
const roles = (): FakeTable => ({
  name: 'roles',
  rows: [
    { id: 'admin', permissions: { '*': ['*'] } },
    { id: 'viewer', permissions: { '*': ['list', 'show'] } },
    { id: 'lurker', permissions: { '*': ['list'] } },
  ],
  properties: [
    new BaseProperty({ path: 'id', isId: true }),
    new BaseProperty({ path: 'permissions', type: 'string' }),
  ],
})

const build = (): ModernAdmin =>
  new ModernAdmin({
    adapters: [adapter],
    databases: [[users(), roles()]],
    rolesResourceId: 'roles',
  })

const actionNames = async (admin: ModernAdmin, role?: string): Promise<string[]> => {
  const json = await admin.toJSON(role ? { id: '1', role } : null)
  const resource = json.resources.find((r) => r.id === 'users')!
  return resource.actions.map((a) => a.name).sort()
}

describe('config snapshot honours the role matrix', () => {
  test('a full-access role keeps the mutating actions', async () => {
    const names = await actionNames(build(), 'admin')
    expect(names).toContain('new')
    expect(names).toContain('edit')
    expect(names).toContain('delete')
    expect(names).toContain('bulkDelete')
  })

  test('a read-only role gets no button for what it cannot run', async () => {
    const names = await actionNames(build(), 'viewer')
    expect(names).toContain('list')
    expect(names).toContain('show')
    expect(names).not.toContain('new')
    expect(names).not.toContain('edit')
    expect(names).not.toContain('delete')
    expect(names).not.toContain('bulkDelete')
  })

  test('an anonymous caller gets nothing while role enforcement is on', async () => {
    // `rolesResourceId` opts the deployment into default-deny for principals
    // without a role — the snapshot has to say so, not advertise a full menu.
    expect(await actionNames(build(), undefined)).toEqual([])
  })

  test('the unfiltered sync snapshot is untouched', () => {
    const resource = build()
      .toJSON()
      .resources.find((r) => r.id === 'users')!
    expect(resource.actions.map((a) => a.name)).toContain('delete')
  })

  test('every advertised action is one invoke() would accept', async () => {
    const admin = build()
    const viewer = { id: '1', role: 'viewer' }
    const json = await admin.toJSON(viewer)
    const resource = json.resources.find((r) => r.id === 'users')!
    for (const action of resource.actions) {
      expect(await admin.canAccess('users', action.name, viewer)).toBe(true)
    }
  })
})

describe('api-key allowlist shapes the snapshot too', () => {
  test('actions outside the key permissions are dropped', async () => {
    const admin = new ModernAdmin({ adapters: [adapter], databases: [[users()]] })
    const json = await admin.toJSON({
      id: 'key-1',
      role: 'admin',
      apiKey: { permissions: { users: ['list', 'show'] } },
    })
    const names = json.resources.find((r) => r.id === 'users')!.actions.map((a) => a.name)
    expect(names).toContain('list')
    expect(names).not.toContain('delete')
  })
})

describe('recordActions honour the role matrix', () => {
  const listFor = async (admin: ModernAdmin, role: string): Promise<ListActionResponse> =>
    admin.invoke<ListActionResponse>(
      { params: { resourceId: 'users', action: 'list' }, method: 'get' },
      { id: '1', role },
    )

  test('a read-only role sees no edit/delete in the row menu', async () => {
    const res = await listFor(build(), 'viewer')
    expect(res.records[0]!.recordActions).toEqual(['show'])
  })

  test('a full-access role keeps them', async () => {
    const res = await listFor(build(), 'admin')
    expect(res.records[0]!.recordActions).toContain('edit')
    expect(res.records[0]!.recordActions).toContain('delete')
  })

  test('a role with no record action at all reports an empty verdict', async () => {
    // Not an absent field: the client reads "no verdict" as "no opinion" and
    // fails open, which would put the whole menu back on screen.
    const res = await listFor(build(), 'lurker')
    expect(res.records[0]!.recordActions).toEqual([])
  })

  test('the gate the snapshot applies is the one invoke() enforces', async () => {
    const admin = build()
    await expect(
      admin.invoke(
        { params: { resourceId: 'users', action: 'delete', recordId: '1' }, method: 'post' },
        { id: '1', role: 'viewer' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})
