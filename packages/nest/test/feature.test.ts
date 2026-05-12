import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '@modern-admin/core'
import { Test } from '@nestjs/testing'
import { DiscoveryModule } from '@nestjs/core'
import {
  Action,
  AdminController,
  AdminControllerScanner,
  AdminResource,
  Before,
  ModernAdminBootstrapService,
  type AdminActionContext,
} from '../src/admin'
import { MODERN_ADMIN, MODERN_ADMIN_OPTIONS } from '../src/tokens.js'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as never

const buildContext = async (controllers: Array<new (...args: never[]) => AdminController>) => {
  const admin = new ModernAdmin({ adapters: [adapter] })
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      AdminControllerScanner,
      ModernAdminBootstrapService,
      { provide: MODERN_ADMIN, useValue: admin },
      { provide: MODERN_ADMIN_OPTIONS, useValue: { adapters: [adapter] } },
      ...controllers.map((c) => ({ provide: c, useClass: c })),
    ],
  }).compile()
  await moduleRef.init()
  return { admin, moduleRef }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const usersTable: FakeTable = { name: 'users', rows: [{ id: '1', name: 'Ann' }] }
const postsTable: FakeTable = { name: 'posts', rows: [] }

@AdminResource({ source: () => usersTable, navigation: { icon: 'Users' } })
class UsersAdminController extends AdminController<{ id: string; name: string }> {}

@AdminResource({ source: () => postsTable })
class PostsAdminController extends AdminController {}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AdminControllerScanner', () => {
  test('registers @AdminResource controllers as resources', async () => {
    const { admin } = await buildContext([UsersAdminController, PostsAdminController])
    expect(admin.resources.map((r) => r.decorate().id).sort()).toEqual(['posts', 'users'])
  })

  test('passes navigation metadata through to ResourceOptions', async () => {
    const { admin } = await buildContext([UsersAdminController])
    expect(admin.findResource('users').decorate().navigation).toEqual({ icon: 'Users' })
  })

  test('wires admin and resource onto each controller instance', async () => {
    const { admin, moduleRef } = await buildContext([UsersAdminController])
    const ctrl = moduleRef.get(UsersAdminController)
    expect(ctrl.admin).toBe(admin)
    expect(ctrl.resource.decorate().id).toBe('users')
  })
})

describe('Custom @Action', () => {
  test('exposes a record-level custom action', async () => {
    const usersFixture: FakeTable = { name: 'users', rows: [{ id: '1', name: 'A' }] }
    @AdminResource({ source: () => usersFixture })
    class C extends AdminController<{ id: string; name: string }> {
      @Action({ actionType: 'record', name: 'ping' })
      ping(ctx: AdminActionContext<{ id: string; name: string }>) {
        return { record: ctx.record!.toJSON(), notice: { message: 'pong', type: 'success' as const } }
      }
    }
    const { admin } = await buildContext([C])
    const res = await admin.invoke({
      params: { resourceId: 'users', recordId: '1', action: 'ping' },
      method: 'post',
    })
    expect((res as { notice: { message: string } }).notice.message).toBe('pong')
  })

  test('serializes nested action grouping metadata', async () => {
    const usersFixture: FakeTable = { name: 'users', rows: [{ id: '1', name: 'A' }] }
    @AdminResource({ source: () => usersFixture })
    class C extends AdminController<{ id: string; name: string }> {
      @Action({
        actionType: 'record',
        name: 'ping',
        nesting: ['Publishing', { name: 'Danger Zone', icon: 'TriangleAlert' }],
      })
      ping(ctx: AdminActionContext<{ id: string; name: string }>) {
        return { record: ctx.record!.toJSON(), notice: { message: 'pong', type: 'success' as const } }
      }
    }
    const { admin } = await buildContext([C])
    expect(admin.findResource('users').decorate().toJSON().actions).toContainEqual(
      expect.objectContaining({
        name: 'ping',
        nesting: [
          { name: 'Publishing' },
          { name: 'Danger Zone', icon: 'TriangleAlert' },
        ],
      }),
    )
  })
})

describe('@Before hook', () => {
  test('mutates payload before built-in handler runs', async () => {
    const usersFixture: FakeTable = { name: 'users', rows: [] }
    @AdminResource({ source: () => usersFixture })
    class C extends AdminController<{ id: string; name: string }> {
      @Before('new')
      uppercase(ctx: AdminActionContext<{ id: string; name: string }>) {
        if (typeof ctx.payload.name === 'string') {
          ctx.payload.name = ctx.payload.name.toUpperCase()
        }
      }
    }
    const { admin } = await buildContext([C])
    const res = await admin.invoke({
      params: { resourceId: 'users', action: 'new' },
      method: 'post',
      payload: { name: 'mixedCase' },
    })
    expect((res as { record: { params: { name: string } } }).record.params.name).toBe('MIXEDCASE')
  })
})

describe('Built-in override', () => {
  test('subclassing list replaces the default handler', async () => {
    const usersFixture: FakeTable = { name: 'users', rows: [{ id: '1' }, { id: '2' }] }
    @AdminResource({ source: () => usersFixture })
    class C extends AdminController {
      override async list(_ctx: never) {
        return { records: [], meta: { total: 0, page: 1, perPage: 20 } }
      }
    }
    const { admin } = await buildContext([C])
    const res = await admin.invoke({
      params: { resourceId: 'users', action: 'list' },
      method: 'get',
      query: {},
    })
    expect((res as { meta: { total: number } }).meta.total).toBe(0)
  })
})
