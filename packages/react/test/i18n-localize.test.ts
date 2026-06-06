import { describe, expect, test } from 'bun:test'
import { localizeRelatedResources } from '../src/i18n.js'
import type { RelatedResource } from '../src/types.js'

const rel = (overrides: Partial<RelatedResource>): RelatedResource => ({
  resourceId: 'posts',
  foreignKey: 'authorId',
  ...overrides,
})

describe('localizeRelatedResources', () => {
  test('returns undefined when input is undefined', () => {
    expect(localizeRelatedResources(undefined)).toBeUndefined()
  })

  test('returns original items when no translations provided', () => {
    const input = [rel({ label: 'Posts' })]
    const result = localizeRelatedResources(input)
    expect(result).toEqual(input)
  })

  test('applies translation for matching resourceId', () => {
    const input = [rel({ resourceId: 'posts', label: 'Posts' })]
    const result = localizeRelatedResources(input, { posts: 'Публикации' })
    expect(result![0].label).toBe('Публикации')
  })

  test('keeps original label when no matching entry in translation map', () => {
    const input = [rel({ resourceId: 'posts', label: 'Posts' })]
    const result = localizeRelatedResources(input, { comments: 'Комментарии' })
    expect(result![0].label).toBe('Posts')
  })

  test('first matching map wins (locale over fallback)', () => {
    const input = [rel({ resourceId: 'posts' })]
    const result = localizeRelatedResources(input, { posts: 'Locale' }, { posts: 'Fallback' })
    expect(result![0].label).toBe('Locale')
  })

  test('falls back to second map when first has no entry', () => {
    const input = [rel({ resourceId: 'posts' })]
    const result = localizeRelatedResources(input, undefined, { posts: 'Fallback' })
    expect(result![0].label).toBe('Fallback')
  })

  test('handles multiple relations independently', () => {
    const input = [
      rel({ resourceId: 'posts', foreignKey: 'authorId', label: 'Posts' }),
      rel({ resourceId: 'comments', foreignKey: 'userId', label: 'Comments' }),
    ]
    const result = localizeRelatedResources(input, { posts: 'Статьи' })
    expect(result![0].label).toBe('Статьи')
    expect(result![1].label).toBe('Comments') // no translation → unchanged
  })

  test('does not mutate original array', () => {
    const input = [rel({ label: 'Posts' })]
    const result = localizeRelatedResources(input, { posts: 'Статьи' })
    expect(input[0].label).toBe('Posts') // original untouched
    expect(result![0].label).toBe('Статьи')
  })
})
