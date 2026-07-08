// Client-side mutation invalidation fan-out. Verifies that
// `invalidateResourceData` marks stale: the mutated resource's queries,
// linked resources' queries (reference graph from the bootstrap config,
// both directions), and the literal-keyed aggregate caches — while leaving
// unrelated resources untouched.

import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { invalidateResourceData } from '../src/hooks.js'
import type { AdminConfig } from '../src/types.js'

const property = (path: string, reference: string | null = null): unknown => ({
  path,
  label: path,
  type: reference ? 'reference' : 'string',
  isId: path === 'id',
  isTitle: false,
  isSortable: true,
  isArray: false,
  reference,
  visibility: { list: true, show: true, edit: true, filter: true },
})

const config = {
  rootPath: '/admin',
  auth: {},
  resources: [
    { id: 'users', name: 'Users', properties: [property('id'), property('name')] },
    {
      id: 'orders',
      name: 'Orders',
      properties: [property('id'), property('userId', 'users')],
    },
    { id: 'products', name: 'Products', properties: [property('id')] },
  ],
} as unknown as AdminConfig

const buildClient = (): QueryClient => {
  const qc = new QueryClient()
  qc.setQueryData(['modern-admin', 'config'], config)
  return qc
}

const seed = (qc: QueryClient, key: unknown[]): void => {
  qc.setQueryData(key, { seeded: true })
}

const isInvalidated = (qc: QueryClient, key: unknown[]): boolean =>
  qc.getQueryState(key)?.isInvalidated === true

describe('invalidateResourceData', () => {
  test('drops the mutated resource, linked resources, and aggregates — not bystanders', () => {
    const qc = buildClient()
    const usersList = ['modern-admin', 'users', 'list', null]
    const ordersList = ['modern-admin', 'orders', 'list', null]
    const productsList = ['modern-admin', 'products', 'list', null]
    const suggestions = ['modern-admin', 'fieldSuggestions', 'users', 'name', 200]
    const globalSearch = ['modern-admin', 'global-search', 'ann']
    const timeseries = ['modern-admin', 'timeseries', { resource: 'orders' }]
    const auditLog = ['modern-admin', 'audit-log', null]
    for (const key of [usersList, ordersList, productsList, suggestions, globalSearch, timeseries, auditLog]) {
      seed(qc, key)
    }

    // Mutating `users` must reach `orders` (its lists embed populated
    // user titles) but not `products` (no reference edge).
    invalidateResourceData(qc, 'users')

    expect(isInvalidated(qc, usersList)).toBe(true)
    expect(isInvalidated(qc, ordersList)).toBe(true)
    expect(isInvalidated(qc, productsList)).toBe(false)
    expect(isInvalidated(qc, suggestions)).toBe(true)
    expect(isInvalidated(qc, globalSearch)).toBe(true)
    expect(isInvalidated(qc, timeseries)).toBe(true)
    expect(isInvalidated(qc, auditLog)).toBe(true)
  })

  test('mutating the referencing side reaches the referenced side (parent aggregates)', () => {
    const qc = buildClient()
    const usersShow = ['modern-admin', 'users', 'show', '1']
    const productsList = ['modern-admin', 'products', 'list', null]
    seed(qc, usersShow)
    seed(qc, productsList)

    // orders.userId → users: a new order must refresh the user's show
    // page (related-records tables, counts).
    invalidateResourceData(qc, 'orders')

    expect(isInvalidated(qc, usersShow)).toBe(true)
    expect(isInvalidated(qc, productsList)).toBe(false)
  })

  test('user-dir entries drop only when the users resource mutates', () => {
    const qc = buildClient()
    const userDir = ['modern-admin', 'user-dir', 'users', '1']
    seed(qc, userDir)

    invalidateResourceData(qc, 'products')
    expect(isInvalidated(qc, userDir)).toBe(false)

    invalidateResourceData(qc, 'users')
    expect(isInvalidated(qc, userDir)).toBe(true)
  })

  test('works without a cached config — own resource + aggregates still drop', () => {
    const qc = new QueryClient()
    const usersList = ['modern-admin', 'users', 'list', null]
    const globalSearch = ['modern-admin', 'global-search', 'x']
    seed(qc, usersList)
    seed(qc, globalSearch)

    invalidateResourceData(qc, 'users')

    expect(isInvalidated(qc, usersList)).toBe(true)
    expect(isInvalidated(qc, globalSearch)).toBe(true)
  })
})
