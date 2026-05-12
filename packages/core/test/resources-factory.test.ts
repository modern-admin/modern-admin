import { describe, expect, test } from 'bun:test'
import { ResourcesFactory, type Adapter, type GlobalPlugin } from '../src/factories/resources-factory.js'
import { NoDatabaseAdapterError, NoResourceAdapterError } from '../src/errors'
import { FakeDatabase, FakeResource, type FakeTable } from './_helpers/fake-adapter.js'

const adapter = { Database: FakeDatabase, Resource: FakeResource } as unknown as Adapter

describe('ResourcesFactory', () => {
  test('builds resources from a database adapter', () => {
    const tables: FakeTable[] = [
      { name: 'users', rows: [] },
      { name: 'posts', rows: [] },
    ]
    const result = ResourcesFactory.buildResources({
      databases: [tables],
      adapters: [adapter],
    })
    expect(result.map((r) => r.id())).toEqual(['users', 'posts'])
    // Each must be decorated by the factory
    expect(result.every((r) => r.decorate())).toBe(true)
  })

  test('builds resources from raw resource configs', () => {
    const table: FakeTable = { name: 'users', rows: [] }
    const result = ResourcesFactory.buildResources({
      resources: [{ resource: table, options: { id: 'users' } }],
      adapters: [adapter],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.decorate().id).toBe('users')
  })

  test('options-resources override database-resources of same id', () => {
    const tables: FakeTable[] = [{ name: 'users', rows: [{ id: '1' }] }]
    const overrideTable: FakeTable = { name: 'users', rows: [] }
    const result = ResourcesFactory.buildResources({
      databases: [tables],
      resources: [{ resource: overrideTable, options: { id: 'users' } }],
      adapters: [adapter],
    })
    expect(result).toHaveLength(1)
  })

  test('throws when no database adapter matches', () => {
    expect(() =>
      ResourcesFactory.buildResources({
        databases: ['not-an-array'],
        adapters: [adapter],
      }),
    ).toThrow(NoDatabaseAdapterError)
  })

  test('throws when no resource adapter matches', () => {
    expect(() =>
      ResourcesFactory.buildResources({
        resources: ['not-a-resource'],
        adapters: [adapter],
      }),
    ).toThrow(NoResourceAdapterError)
  })

  describe('global plugins', () => {
    const usersTable: FakeTable = { name: 'users', rows: [] }
    const postsTable: FakeTable = { name: 'posts', rows: [] }
    const healthTable: FakeTable = { name: 'health', rows: [] }

    test('applies a plugin to every built resource by default', () => {
      const seen: string[] = []
      const plugin: GlobalPlugin = {
        apply: (opts, resource) => {
          seen.push(resource.id())
          return opts
        },
      }
      ResourcesFactory.buildResources({
        databases: [[usersTable, postsTable]],
        adapters: [adapter],
        plugins: [plugin],
      })
      expect(seen.sort()).toEqual(['posts', 'users'])
    })

    test('include whitelists resource ids', () => {
      const seen: string[] = []
      const plugin: GlobalPlugin = {
        include: ['users'],
        apply: (opts, resource) => { seen.push(resource.id()); return opts },
      }
      ResourcesFactory.buildResources({
        databases: [[usersTable, postsTable]],
        adapters: [adapter],
        plugins: [plugin],
      })
      expect(seen).toEqual(['users'])
    })

    test('exclude blacklists resource ids', () => {
      const seen: string[] = []
      const plugin: GlobalPlugin = {
        exclude: ['health'],
        apply: (opts, resource) => { seen.push(resource.id()); return opts },
      }
      ResourcesFactory.buildResources({
        databases: [[usersTable, postsTable, healthTable]],
        adapters: [adapter],
        plugins: [plugin],
      })
      expect(seen.sort()).toEqual(['posts', 'users'])
    })

    test('plugin output is overridable by user ResourceOptions', () => {
      const plugin: GlobalPlugin = {
        apply: (opts) => ({ ...opts, name: 'PluginName' }),
      }
      const result = ResourcesFactory.buildResources({
        resources: [{ resource: usersTable, options: { id: 'users', name: 'UserSet' } }],
        adapters: [adapter],
        plugins: [plugin],
      })
      expect(result[0]!.decorate().name).toBe('UserSet')
    })

    test('plugin filter respects ResourceOptions.id override', () => {
      const seen: string[] = []
      const plugin: GlobalPlugin = {
        include: ['accounts'],
        apply: (opts, resource) => { seen.push(resource.id()); return opts },
      }
      ResourcesFactory.buildResources({
        // raw resource id is "users" but options renames to "accounts"
        resources: [{ resource: usersTable, options: { id: 'accounts' } }],
        adapters: [adapter],
        plugins: [plugin],
      })
      expect(seen).toEqual(['users']) // observed via resource.id() — but it ran
    })
  })
})
