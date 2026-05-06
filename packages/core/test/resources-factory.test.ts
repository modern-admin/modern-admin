import { describe, expect, test } from 'bun:test'
import { ResourcesFactory, type Adapter } from '../src/factories/resources-factory.js'
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
})
