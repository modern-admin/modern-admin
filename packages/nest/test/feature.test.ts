import { describe, expect, test } from 'bun:test'
import { ModernAdmin } from '@modern-admin/core'
import { Test } from '@nestjs/testing'
import { DiscoveryModule, HttpAdapterHost } from '@nestjs/core'
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

// Express 5 (Nest 11 + @nestjs/platform-express ≥ 11) ships with
// `'simple'` as the default query parser, which leaves `filters[k]=v`
// as a flat key with brackets in the name instead of parsing it into a
// nested object. The bootstrap service forces `'extended'` so the list
// action's Zod DTO sees `filters` as an object and the related-records
// UI on the frontend actually filters.
describe('Express query parser auto-fix', () => {
  const buildWithHttpAdapter = async (httpAdapter: unknown) => {
    const admin = new ModernAdmin({ adapters: [adapter] })
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        AdminControllerScanner,
        ModernAdminBootstrapService,
        { provide: MODERN_ADMIN, useValue: admin },
        { provide: MODERN_ADMIN_OPTIONS, useValue: { adapters: [adapter] } },
        { provide: HttpAdapterHost, useValue: { httpAdapter } },
      ],
    }).compile()
    await moduleRef.init()
    return moduleRef
  }

  test("forces 'simple' Express parser to 'extended' at bootstrap", async () => {
    const settings: Record<string, unknown> = { 'query parser': 'simple' }
    const expressApp = {
      get: (k: string) => settings[k],
      set: (k: string, v: unknown) => { settings[k] = v },
    }
    const httpAdapter = { getInstance: () => expressApp }
    await buildWithHttpAdapter(httpAdapter)
    expect(settings['query parser']).toBe('extended')
  })

  test("leaves user-installed function parser alone", async () => {
    const customParser = (s: string): Record<string, string> => ({ raw: s })
    const settings: Record<string, unknown> = { 'query parser': customParser }
    const expressApp = {
      get: (k: string) => settings[k],
      set: (k: string, v: unknown) => { settings[k] = v },
    }
    const httpAdapter = { getInstance: () => expressApp }
    await buildWithHttpAdapter(httpAdapter)
    expect(settings['query parser']).toBe(customParser)
  })

  test('skips silently on non-Express adapters (no getInstance)', async () => {
    // Fastify-style adapter: no Express-style get/set on the instance.
    const httpAdapter = { getInstance: () => ({}) }
    await expect(buildWithHttpAdapter(httpAdapter)).resolves.toBeDefined()
  })
})
