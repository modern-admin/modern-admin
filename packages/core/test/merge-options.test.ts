import { describe, expect, it } from 'bun:test'
import {
  deepMerge,
  RESOURCE_OPTIONS_ARRAY_STRATEGIES,
} from '../src/utils/merge-options.js'

describe('deepMerge', () => {
  it('concatenates arrays by default', () => {
    const merged = deepMerge(
      { relatedResources: [{ resourceId: 'a', foreignKey: 'x' }] },
      { relatedResources: [{ resourceId: 'b', foreignKey: 'y' }] },
    )
    expect(merged.relatedResources).toHaveLength(2)
  })

  it('deep-merges plain objects and overrides scalars', () => {
    const merged = deepMerge(
      { name: 'plugin', sort: { sortBy: 'id', direction: 'asc' as string } },
      { name: 'user', sort: { direction: 'desc' } } as never,
    )
    expect(merged.name).toBe('user')
    expect(merged.sort).toEqual({ sortBy: 'id', direction: 'desc' })
  })

  it('keeps base value when override is nullish', () => {
    expect(deepMerge({ a: 1 }, undefined as never)).toEqual({ a: 1 })
  })

  it('replaces arrays for keys registered as replace', () => {
    const merged = deepMerge(
      { listProperties: ['id', 'name'] },
      { listProperties: ['name', 'email'] },
      RESOURCE_OPTIONS_ARRAY_STRATEGIES,
    )
    expect(merged.listProperties).toEqual(['name', 'email'])
  })

  it('matches wildcard segments for nested paths', () => {
    const merged = deepMerge(
      { properties: { status: { availableValues: ['draft'] } } },
      { properties: { status: { availableValues: ['draft', 'live'] } } },
      RESOURCE_OPTIONS_ARRAY_STRATEGIES,
    )
    expect(merged.properties.status.availableValues).toEqual(['draft', 'live'])
  })

  it('leaves unlisted nested arrays on concat', () => {
    const merged = deepMerge(
      { custom: { tags: ['a'] } },
      { custom: { tags: ['b'] } },
      RESOURCE_OPTIONS_ARRAY_STRATEGIES,
    )
    expect(merged.custom.tags).toEqual(['a', 'b'])
  })

  it('does not apply a replace strategy at a different depth', () => {
    const merged = deepMerge(
      { custom: { listProperties: ['a'] } },
      { custom: { listProperties: ['b'] } },
      RESOURCE_OPTIONS_ARRAY_STRATEGIES,
    )
    expect(merged.custom.listProperties).toEqual(['a', 'b'])
  })
})
