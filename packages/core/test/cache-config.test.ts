import { describe, expect, test } from 'bun:test'
import {
  resolveResourceCacheConfig,
  TAG_ONLY_TTL_SECONDS,
  DEFAULT_TTL_SECONDS,
} from '../src/decorators/cache-config.js'

describe('resolveResourceCacheConfig', () => {
  test('returns defaults when no cache config is set', () => {
    expect(resolveResourceCacheConfig({}, 'list')).toEqual({
      enabled: true,
      ttl: DEFAULT_TTL_SECONDS.list,
    })
    expect(resolveResourceCacheConfig({}, 'show')).toEqual({
      enabled: true,
      ttl: DEFAULT_TTL_SECONDS.show,
    })
    expect(resolveResourceCacheConfig({}, 'search')).toEqual({
      enabled: true,
      ttl: DEFAULT_TTL_SECONDS.search,
    })
    expect(resolveResourceCacheConfig({}, 'http')).toEqual({
      enabled: true,
      ttl: DEFAULT_TTL_SECONDS.http,
    })
  })

  test('treats undefined options object as defaults', () => {
    expect(resolveResourceCacheConfig(undefined, 'list')).toEqual({
      enabled: true,
      ttl: DEFAULT_TTL_SECONDS.list,
    })
  })

  test('cache: false disables every read action', () => {
    const opts = { cache: false as const }
    for (const action of ['list', 'show', 'search', 'http'] as const) {
      expect(resolveResourceCacheConfig(opts, action)).toEqual({ enabled: false, ttl: 0 })
    }
  })

  test("strategy 'off' disables every read action", () => {
    const opts = { cache: { strategy: 'off' as const } }
    for (const action of ['list', 'show', 'search', 'http'] as const) {
      expect(resolveResourceCacheConfig(opts, action)).toEqual({ enabled: false, ttl: 0 })
    }
  })

  test("strategy 'tag-only' substitutes a 30-day TTL", () => {
    const opts = { cache: { strategy: 'tag-only' as const } }
    expect(resolveResourceCacheConfig(opts, 'list')).toEqual({
      enabled: true,
      ttl: TAG_ONLY_TTL_SECONDS,
    })
    expect(TAG_ONLY_TTL_SECONDS).toBe(30 * 24 * 60 * 60)
  })

  test('resource-level ttl overrides the action default', () => {
    const opts = { cache: { ttl: 600 } }
    expect(resolveResourceCacheConfig(opts, 'list')).toEqual({ enabled: true, ttl: 600 })
    expect(resolveResourceCacheConfig(opts, 'show')).toEqual({ enabled: true, ttl: 600 })
    expect(resolveResourceCacheConfig(opts, 'search')).toEqual({ enabled: true, ttl: 600 })
    expect(resolveResourceCacheConfig(opts, 'http')).toEqual({ enabled: true, ttl: 600 })
  })

  test('per-action ttl wins over resource-level ttl', () => {
    const opts = {
      cache: { ttl: 600, list: { ttl: 30 }, show: { ttl: 7200 } },
    }
    expect(resolveResourceCacheConfig(opts, 'list')).toEqual({ enabled: true, ttl: 30 })
    expect(resolveResourceCacheConfig(opts, 'show')).toEqual({ enabled: true, ttl: 7200 })
    expect(resolveResourceCacheConfig(opts, 'search')).toEqual({ enabled: true, ttl: 600 })
  })

  test('per-action enabled: false disables only that action', () => {
    const opts = {
      cache: { ttl: 600, list: { enabled: false }, show: {} },
    }
    expect(resolveResourceCacheConfig(opts, 'list')).toEqual({ enabled: false, ttl: 0 })
    expect(resolveResourceCacheConfig(opts, 'show')).toEqual({ enabled: true, ttl: 600 })
  })

  test("per-action ttl also wins under strategy: 'tag-only'", () => {
    const opts = {
      cache: { strategy: 'tag-only' as const, list: { ttl: 60 } },
    }
    expect(resolveResourceCacheConfig(opts, 'list')).toEqual({ enabled: true, ttl: 60 })
    expect(resolveResourceCacheConfig(opts, 'show')).toEqual({
      enabled: true,
      ttl: TAG_ONLY_TTL_SECONDS,
    })
  })

  test('http slot is independent from list/show', () => {
    const opts = {
      cache: { list: { ttl: 30 }, http: { ttl: 1800 } },
    }
    expect(resolveResourceCacheConfig(opts, 'list')).toEqual({ enabled: true, ttl: 30 })
    expect(resolveResourceCacheConfig(opts, 'http')).toEqual({ enabled: true, ttl: 1800 })
  })
})
