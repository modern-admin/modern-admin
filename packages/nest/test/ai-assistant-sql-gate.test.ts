// Verifies that the AI assistant's `execute_sql` tool is gated on the
// per-role permission matrix (synthetic key `__sql__` / action
// `execute`). Without that grant, the host's `rawQuery` MUST NOT reach
// `buildAiAssistantTools` and the `execute_sql` tool must not appear in
// the resulting tool registry. Wildcard role permissions (`'*': ['*']`,
// as used by the seeded `admin` role) cover the synthetic key for free.

import { describe, expect, test } from 'bun:test'
import {
  BaseProperty,
  BaseRecord,
  BaseResource,
  type CurrentAdmin,
  type Filter,
  type FindOptions,
  ModernAdmin,
  type ParamsType,
  type RolePermissions,
} from '@modern-admin/core'
import { AiAssistantService } from '../src/ai-assistant.service.js'
import type { ModernAdminModuleOptions } from '../src/module.js'

/**
 * Minimal in-memory resource backing both the "posts" demo data and the
 * "roles" permission matrix lookup. `findOne` returns the row matching
 * the requested id, which is exactly what `ModernAdmin.getRolePermissions`
 * relies on.
 */
class MemResource extends BaseResource {
  private readonly props = [
    new BaseProperty({ path: 'id', type: 'uuid', isId: true, isRequired: true }),
  ]

  constructor(
    private readonly resourceId: string,
    private readonly tableName: string,
    private readonly rows: ParamsType[],
  ) {
    super()
  }

  override id(): string {
    return this.resourceId
  }

  override databaseName(): string {
    return this.tableName
  }

  override properties(): BaseProperty[] {
    return this.props
  }

  override async count(_filter: Filter): Promise<number> {
    return this.rows.length
  }

  override async find(_filter: Filter, _options: FindOptions): Promise<BaseRecord[]> {
    return this.rows.map((row) => new BaseRecord(row, this))
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const row = this.rows.find((item) => String(item.id) === id)
    return row ? new BaseRecord(row, this) : null
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const wanted = new Set(ids.map(String))
    return this.rows
      .filter((row) => wanted.has(String(row.id)))
      .map((row) => new BaseRecord(row, this))
  }

  override async create(params: ParamsType): Promise<ParamsType> {
    this.rows.push(params)
    return params
  }

  override async update(id: string, params: ParamsType): Promise<ParamsType> {
    const index = this.rows.findIndex((row) => String(row.id) === id)
    this.rows[index] = { ...this.rows[index], ...params }
    return this.rows[index]!
  }

  override async delete(id: string): Promise<void> {
    const index = this.rows.findIndex((row) => String(row.id) === id)
    if (index >= 0) this.rows.splice(index, 1)
  }
}

const ROLES: Array<{ id: string; permissions: RolePermissions }> = [
  // Mirrors the seeded `admin` role: wildcard resource + wildcard action.
  // The synthetic `__sql__:execute` key is covered through the same
  // wildcard, so existing super-user roles keep raw-SQL access for free.
  { id: 'admin', permissions: { '*': ['*'] } },
  // Mirrors the seeded `viewer` role: no `execute` action anywhere → no SQL.
  { id: 'viewer', permissions: { '*': ['list', 'show', 'search'] } },
  // Explicit grant for a custom least-privilege role that should run SQL.
  { id: 'sql-runner', permissions: { posts: ['list'], __sql__: ['execute'] } },
  // Explicit wildcard on the synthetic key — equivalent to `execute`.
  { id: 'sql-wild', permissions: { __sql__: ['*'] } },
  // Has SQL via different action name (must NOT match `execute`).
  { id: 'sql-typo', permissions: { __sql__: ['read'] } },
]

const buildAdmin = (): ModernAdmin =>
  new ModernAdmin({
    resources: [
      new MemResource('posts', 'post', [{ id: 'p1', title: 'Hello' }]),
      new MemResource(
        'roles',
        'ma_role',
        ROLES.map((role) => ({ id: role.id, permissions: role.permissions })),
      ),
    ],
    rolesResourceId: 'roles',
  })

type RawQueryFn = (sql: string) => Promise<unknown[]>

const buildService = (admin: ModernAdmin, rawQuery: RawQueryFn | undefined): AiAssistantService => {
  const options: ModernAdminModuleOptions = {
    aiAssistant: rawQuery ? { rawQuery } : {},
  }
  return new AiAssistantService(admin, options)
}

type ResolveRaw = (
  current: CurrentAdmin | undefined,
  debug: boolean,
) => Promise<((sql: string) => Promise<unknown[]>) | undefined>

const callResolver = (service: AiAssistantService): ResolveRaw =>
  // The resolver is private — cast through `unknown` so tests can assert
  // its behaviour without exposing it on the service's public surface.
  ((service as unknown as { resolveRawQueryForRequest: ResolveRaw }).resolveRawQueryForRequest.bind(
    service,
  )) as ResolveRaw

const rawQueryStub = async (): Promise<unknown[]> => []

describe('AiAssistantService execute_sql gate', () => {
  test('returns rawQuery when role has wildcard permissions (admin)', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'admin' }, false)
    expect(result).toBe(rawQueryStub)
  })

  test('returns rawQuery when role has explicit __sql__:execute grant', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'sql-runner' }, false)
    expect(result).toBe(rawQueryStub)
  })

  test('returns rawQuery when role has __sql__:* (wildcard action)', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'sql-wild' }, false)
    expect(result).toBe(rawQueryStub)
  })

  test('omits rawQuery for read-only viewer role (no execute action)', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'viewer' }, false)
    expect(result).toBeUndefined()
  })

  test('omits rawQuery when the role lists __sql__ with a non-execute action', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'sql-typo' }, false)
    expect(result).toBeUndefined()
  })

  test('omits rawQuery for unknown role (default-deny)', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'ghost' }, false)
    expect(result).toBeUndefined()
  })

  test('omits rawQuery when no role is attached to the principal', async () => {
    const service = buildService(buildAdmin(), rawQueryStub)
    const result = await callResolver(service)({ id: 'u1' }, false)
    expect(result).toBeUndefined()
  })

  test('omits rawQuery when the host did not wire rawQuery at all', async () => {
    const service = buildService(buildAdmin(), undefined)
    const result = await callResolver(service)({ id: 'u1', role: 'admin' }, false)
    expect(result).toBeUndefined()
  })

  test('default-deny when rolesResourceId is not configured framework-wide', async () => {
    // No `rolesResourceId` → `getRolePermissions()` returns null → gate denies.
    // This is the conscious break from the rest of the framework's
    // "missing data → allow" stance: raw SQL is too powerful to grant
    // by accident.
    const admin = new ModernAdmin({
      resources: [new MemResource('posts', 'post', [])],
    })
    const service = buildService(admin, rawQueryStub)
    const result = await callResolver(service)({ id: 'u1', role: 'admin' }, false)
    expect(result).toBeUndefined()
  })
})
