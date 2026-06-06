import { describe, expect, test } from 'bun:test'
import {
  isToManyReferenceProperty,
  resolveRelatedResources,
  visibleRecordProperties,
} from '../src/relations.js'
import type { PropertyJSON, ResourceJSON } from '../src/types.js'

const prop = (overrides: Partial<PropertyJSON>): PropertyJSON => ({
  path: 'id',
  label: 'ID',
  type: 'string',
  isId: false,
  isSortable: false,
  isRequired: false,
  isDisabled: false,
  isArray: false,
  reference: null,
  availableValues: null,
  components: {},
  visibility: { list: true, show: true, edit: true, filter: true },
  position: 0,
  custom: {},
  ...overrides,
})

const resource = (overrides: Partial<ResourceJSON>): ResourceJSON => ({
  id: 'users',
  name: 'Users',
  navigation: null,
  properties: [],
  actions: [],
  ...overrides,
})

describe('relations helpers', () => {
  test('detects virtual to-many reference fields', () => {
    expect(isToManyReferenceProperty(prop({
      path: 'posts',
      type: 'reference',
      isArray: true,
      reference: 'posts',
    }))).toBe(true)
    expect(isToManyReferenceProperty(prop({
      path: 'tags',
      type: 'm2m',
      isArray: true,
      reference: 'tags',
    }))).toBe(false)
  })

  test('hides virtual to-many reference fields from record properties', () => {
    const properties = [
      prop({ path: 'email', label: 'Email' }),
      prop({ path: 'posts', type: 'reference', isArray: true, reference: 'posts' }),
    ]

    expect(visibleRecordProperties(properties, 'list').map((p) => p.path)).toEqual(['email'])
  })

  test('derives related resources from inverse foreign keys', () => {
    const users = resource({
      id: 'users',
      properties: [
        prop({ path: 'email', label: 'Email' }),
        prop({ path: 'posts', label: 'Posts', type: 'reference', isArray: true, reference: 'posts' }),
      ],
    })
    const posts = resource({
      id: 'posts',
      name: 'Posts',
      properties: [
        prop({ path: 'id' }),
        prop({ path: 'authorId', type: 'reference', reference: 'users' }),
      ],
    })

    expect(resolveRelatedResources(users, [users, posts])).toEqual([
      { resourceId: 'posts', foreignKey: 'authorId', label: 'Posts' },
    ])
  })
})
