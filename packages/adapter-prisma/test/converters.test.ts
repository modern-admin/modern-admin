import { describe, expect, test } from 'bun:test'
import { Filter, ModernAdmin, uuidv7, type ListActionResponse } from '@modern-admin/core'
import { filterToWhere, findOptionsToPrisma } from '../src/converters.js'
import { PrismaResource } from '../src/resource.js'
import { postModel, userModel } from './_helpers/dmmf.js'
import { createClient, createDelegate } from './_helpers/fake-client.js'

const buildResource = () =>
  new PrismaResource({
    model: userModel,
    client: createClient({ user: createDelegate() }),
  })

describe('filterToWhere', () => {
  test('legacy numeric ranges survive list resolution with and without relation predicates', async () => {
    const authorId = uuidv7()
    const postDelegate = createDelegate(
      [2.57, 3, 3.05, 4].map((rating) => ({ id: uuidv7(), rating, authorId })),
    )
    const client = createClient({
      user: createDelegate([{ id: authorId, email: 'author@example.com' }]),
      post: postDelegate,
    })
    const admin = new ModernAdmin({
      resources: [
        new PrismaResource({ model: userModel, client }),
        new PrismaResource({
          model: {
            ...postModel,
            fields: [
              ...postModel.fields.map((field) =>
                field.isId ? { ...field, type: 'String' } : field,
              ),
              { ...postModel.fields[1]!, name: 'rating', type: 'Float' },
            ],
          },
          client,
        }),
      ],
    })
    for (const filters of [
      { rating: 'between:3,3.1' },
      {
        rating: 'between:3,3.1',
        'authorId.email': { operator: 'eq', value: 'author@example.com' },
      },
    ]) {
      const result = await admin.invoke<ListActionResponse>({
        params: { resourceId: 'Post', action: 'list' },
        method: 'get',
        query: { filters },
      })
      expect(result.records.map((record) => record.params.rating)).toEqual([3, 3.05])
      expect(result.meta.total).toBe(2)
    }
    const openEnded = await admin.invoke<ListActionResponse>({
      params: { resourceId: 'Post', action: 'list' },
      method: 'get',
      query: {
        filters: {
          rating: 'between:3.05,',
          'authorId.email': { operator: 'eq', value: 'author@example.com' },
        },
      },
    })
    expect(openEnded.records.map((record) => record.params.rating)).toEqual([3.05, 4])
  })
  test('empty relation matches and intersections never reach Prisma as a cleared IN filter', async () => {
    const authorId = uuidv7()
    const postId = uuidv7()
    const authorDelegate = createDelegate([{ id: authorId, email: 'author@example.com' }])
    const postDelegate = createDelegate([{ id: postId, title: 'Post', authorId }])
    const client = createClient({ user: authorDelegate, post: postDelegate })
    const admin = new ModernAdmin({
      resources: [
        new PrismaResource({ model: userModel, client }),
        new PrismaResource({
          model: {
            ...postModel,
            fields: postModel.fields.map((field) =>
              field.isId ? { ...field, type: 'String' } : field,
            ),
          },
          client,
        }),
      ],
    })
    for (const filters of [
      { 'authorId.email': { operator: 'eq', value: 'missing@example.com' } },
      {
        authorId: { operator: 'eq', value: uuidv7() },
        'authorId.email': { operator: 'eq', value: 'author@example.com' },
      },
    ]) {
      const result = await admin.invoke<ListActionResponse>({
        params: { resourceId: 'Post', action: 'list' },
        method: 'get',
        query: { filters },
      })
      expect(result.records).toEqual([])
      expect(result.meta.total).toBe(0)
    }
    expect(authorDelegate.calls.some((call) => call.method === 'findMany')).toBe(true)
    expect(postDelegate.calls).toEqual([])
  })
  test('string fields produce case-insensitive contains clauses', () => {
    const resource = buildResource()
    const filter = new Filter({ email: 'foo@bar' }, resource)
    expect(filterToWhere(filter)).toEqual({
      email: { contains: 'foo@bar', mode: 'insensitive' },
    })
  })

  test('numeric fields coerce strings and emit equals', () => {
    const resource = buildResource()
    const filter = new Filter({ age: '42' }, resource)
    expect(filterToWhere(filter)).toEqual({ age: { equals: 42 } })
  })

  test('range qualifier emits gte/lte and coerces datetime values', () => {
    const resource = buildResource()
    const filter = new Filter(
      { 'createdAt~~from': '2025-01-01', 'createdAt~~to': '2025-12-31' },
      resource,
    )
    const where = filterToWhere(filter)
    expect((where.createdAt as { gte: Date; lte: Date }).gte).toBeInstanceOf(Date)
    expect((where.createdAt as { gte: Date; lte: Date }).lte).toBeInstanceOf(Date)
  })

  test('skips elements without a backing property', () => {
    const resource = buildResource()
    const filter = new Filter({ unknownField: 'x' }, resource)
    expect(filterToWhere(filter)).toEqual({})
  })

  test('scalar list (isArray) columns use `has` for a single needle', () => {
    const model = {
      name: 'Post',
      fields: [
        {
          name: 'id',
          kind: 'scalar' as const,
          type: 'String',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: true,
        },
        {
          name: 'tagIds',
          kind: 'scalar' as const,
          type: 'String',
          isList: true,
          isRequired: false,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
        },
      ],
    }
    const resource = new PrismaResource({
      model,
      client: createClient({ post: createDelegate() }),
    })
    const filter = new Filter({ tagIds: 'turing' }, resource)
    expect(filterToWhere(filter)).toEqual({ tagIds: { has: 'turing' } })
  })

  test('scalar list columns use `hasSome` for an array of needles', () => {
    const model = {
      name: 'Post',
      fields: [
        {
          name: 'id',
          kind: 'scalar' as const,
          type: 'String',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: true,
        },
        {
          name: 'tagIds',
          kind: 'scalar' as const,
          type: 'String',
          isList: true,
          isRequired: false,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
        },
      ],
    }
    const resource = new PrismaResource({
      model,
      client: createClient({ post: createDelegate() }),
    })
    const filter = new Filter({ tagIds: ['turing', 'logic'] }, resource)
    expect(filterToWhere(filter)).toEqual({ tagIds: { hasSome: ['turing', 'logic'] } })
  })
})

describe('findOptionsToPrisma', () => {
  test('translates limit/offset/sort', () => {
    expect(
      findOptionsToPrisma({
        limit: 10,
        offset: 20,
        sort: { sortBy: 'email', direction: 'desc' },
      }),
    ).toEqual({ take: 10, skip: 20, orderBy: { email: 'desc' } })
  })

  test('omits unset fields', () => {
    expect(findOptionsToPrisma({})).toEqual({})
  })

  test('default direction is asc', () => {
    expect(findOptionsToPrisma({ sort: { sortBy: 'email' } })).toEqual({
      orderBy: { email: 'asc' },
    })
  })
})
