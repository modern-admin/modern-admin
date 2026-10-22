import { describe, expect, test } from 'bun:test'
import {
  Filter,
  ForbiddenError,
  ModernAdmin,
  uuidv7,
  type ListActionResponse,
} from '@modern-admin/core'
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
  test('relation filters join through a referenced unique column instead of the primary key', async () => {
    const userId = uuidv7(),
      postId = uuidv7()
    const email = 'author@example.com'
    const postDelegate = createDelegate([{ id: postId, authorEmail: email }])
    const client = createClient({
      user: createDelegate([{ id: userId, email, age: 42 }]),
      post: postDelegate,
    })
    const users = new PrismaResource({ model: userModel, client })
    const posts = new PrismaResource({
      model: {
        ...postModel,
        fields: postModel.fields.map((field) =>
          field.isId
            ? { ...field, type: 'String' }
            : field.name === 'authorId'
              ? { ...field, name: 'authorEmail' }
              : field.kind === 'object'
                ? { ...field, relationFromFields: ['authorEmail'], relationToFields: ['email'] }
                : field,
        ),
      },
      client,
    })
    const admin = new ModernAdmin({ resources: [users, posts] })
    expect(posts.property('authorEmail')!.referenceFields()).toEqual(['email'])
    for (const direct of [undefined, email, { operator: 'eq' as const, value: email }]) {
      const response = await admin.invoke<ListActionResponse>({
        params: { resourceId: 'Post', action: 'list' },
        method: 'get',
        query: {
          filters: {
            'authorEmail.age': { operator: 'eq', value: 42 },
            ...(direct ? { authorEmail: direct } : {}),
          },
        },
      })
      expect(response.records.map((record) => record.id)).toEqual([postId])
    }
    const query = postDelegate.calls.find((call) => call.method === 'findMany')!
    expect((query.args as { where: unknown }).where).toEqual({ authorEmail: { in: [email] } })
    users.decorate().getPropertyByKey('email')!.options.isAccessible = false
    await expect(
      admin.invoke({
        params: { resourceId: 'Post', action: 'list' },
        method: 'get',
        query: { filters: { 'authorEmail.age': { operator: 'eq', value: 42 } } },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test('list preserves native relation predicates without registering the referenced resource', async () => {
    for (const registerUser of [false, true]) {
      const postDelegate = createDelegate()
      const userDelegate = createDelegate()
      const client = createClient({ user: userDelegate, post: postDelegate })
      const admin = new ModernAdmin({
        resources: [
          new PrismaResource({ model: postModel, client }),
          ...(registerUser ? [new PrismaResource({ model: userModel, client })] : []),
        ],
      })
      for (const filters of [
        { 'author.email': 'author@example.com' },
        { author: { email: 'author@example.com' } },
      ]) {
        await admin.invoke({
          params: { resourceId: 'Post', action: 'list' },
          method: 'get',
          query: { filters },
        })
      }
      const queries = postDelegate.calls.filter((call) => call.method === 'findMany')
      expect(queries).toHaveLength(2)
      for (const query of queries) {
        expect((query.args as { where: unknown }).where).toEqual({
          author: { is: { email: { contains: 'author@example.com', mode: 'insensitive' } } },
        })
      }
      expect(userDelegate.calls).toEqual([])
    }
  })

  test('legacy relation arrays and ranges work in dotted and nested forms across multiple hops', async () => {
    const managerId = uuidv7()
    const authorId = uuidv7()
    const otherAuthorId = uuidv7()
    const postId = uuidv7()
    const client = createClient({
      user: createDelegate([
        { id: managerId, age: 42, email: 'manager@example.com', managerId: null },
        { id: authorId, age: 25, email: 'author@example.com', managerId },
        { id: otherAuthorId, age: 18, email: 'other@example.com', managerId: null },
      ]),
      post: createDelegate([
        { id: postId, authorId },
        { id: uuidv7(), authorId: otherAuthorId },
      ]),
    })
    const admin = new ModernAdmin({
      resources: [
        new PrismaResource({
          model: {
            ...userModel,
            fields: [
              ...userModel.fields,
              { ...postModel.fields[2]!, name: 'managerId', isRequired: false },
              {
                ...postModel.fields[3]!,
                name: 'manager',
                relationFromFields: ['managerId'],
                isRequired: false,
              },
            ],
          },
          client,
        }),
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
      { 'authorId.email': ['author@example.com', 'missing@example.com'] },
      { authorId: { email: ['author@example.com', 'missing@example.com'] } },
      { 'authorId.age': { from: '20', to: '30' } },
      { authorId: { age: { from: '20', to: '30' } } },
      { 'authorId.age~~from': '20', 'authorId.age~~to': '30' },
      { 'authorId.managerId.email': ['manager@example.com'] },
      { authorId: { managerId: { email: ['manager@example.com'] } } },
      { 'authorId.managerId.age': { from: '40', to: '45' } },
      { authorId: { managerId: { age: { from: '40', to: '45' } } } },
      { 'authorId.managerId.age': { from: '40' } },
      { 'authorId.managerId.age': { to: '45' } },
    ]) {
      const result = await admin.invoke<ListActionResponse>({
        params: { resourceId: 'Post', action: 'list' },
        method: 'get',
        query: { filters },
      })
      expect(result.records.map((record) => record.id)).toEqual([postId])
      expect(result.meta.total).toBe(1)
    }
  })

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
