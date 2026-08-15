import { describe, expect, test } from 'bun:test'
import {
  CACHE_KEY_VERSION,
  listCacheKey,
  stableCacheStringify,
} from '../src/actions/cache-keys.js'

describe('cache keys', () => {
  test('canonicalises nested object order while preserving array order', () => {
    expect(stableCacheStringify({ z: 1, nested: { b: 2, a: 1 }, values: [2, 1] }))
      .toBe(stableCacheStringify({ values: [2, 1], nested: { a: 1, b: 2 }, z: 1 }))
    expect(stableCacheStringify({ values: [1, 2] }))
      .not.toBe(stableCacheStringify({ values: [2, 1] }))
  })

  test('keeps scalar types and undefined distinct', () => {
    expect(stableCacheStringify({ a: 1 })).not.toBe(stableCacheStringify({ a: '1' }))
    expect(stableCacheStringify({ a: null })).not.toBe(stableCacheStringify({ a: undefined }))
  })

  test('versions list keys', () => {
    expect(listCacheKey('users', { filters: {}, page: 1, perPage: 20 }))
      .toStartWith(`${CACHE_KEY_VERSION}:list:users:`)
  })
})
