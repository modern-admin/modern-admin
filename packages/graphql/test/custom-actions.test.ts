// Custom actions over GraphQL.
//
// Every non built-in action a resource declares gets two generated fields:
//   * `Mutation.<resource><Action>` — runs it (`method: 'post'`)
//   * `Query.<resource><Action>`    — primes it (`method: 'get'`)
//
// Args follow the action's `actionType`: resource actions take just a
// `payload`, record actions add `id`, bulk actions add `ids`. Responses are
// JSON because a custom handler has no declared schema.
//
// Everything routes through `admin.invoke()`, so the same gates that protect
// the REST surface protect these fields — the tests below pin that too.

import { describe, expect, test } from 'bun:test'
import { execute, parse, printSchema } from 'graphql'
import { ModernAdmin, type ActionContext, type ActionRequest } from '@modern-admin/core'
import { buildGraphqlSchema, createContext } from '../src/schema-builder.js'
import { MemDatabase, MemResource, seed } from './_helpers/in-memory.js'

interface Seen {
  request: ActionRequest
  context: ActionContext
}

const makeAdmin = (seenSink: Seen[] = []): ModernAdmin => {
  // Register the tables directly (rather than via `databases`) so the users
  // table can carry custom actions in its options.
  const tables = seed().tables
  const users = tables.find((t) => t.name === 'users')!
  return new ModernAdmin({
    adapters: [{ Database: MemDatabase, Resource: MemResource }],
    resources: [
      ...tables.filter((t) => t.name !== 'users'),
      {
        resource: users,
        options: {
          actions: {
            sendMassPush: {
              name: 'sendMassPush',
              actionType: 'resource' as const,
              handler: async (request: ActionRequest, context: ActionContext) => {
                seenSink.push({ request, context })
                return request.method === 'post' ? { sent: 2 } : { templates: ['welcome'] }
              },
            },
            ping: {
              name: 'ping',
              actionType: 'record' as const,
              handler: async (request: ActionRequest, context: ActionContext) => {
                seenSink.push({ request, context })
                return { pinged: context.record?.id() ?? null }
              },
            },
            tagAll: {
              name: 'tagAll',
              actionType: 'bulk' as const,
              handler: async (request: ActionRequest, context: ActionContext) => {
                seenSink.push({ request, context })
                return { tagged: context.records?.map((r) => r.id()) ?? [] }
              },
            },
          },
        },
      },
    ],
  })
}

const run = async (admin: ModernAdmin, query: string, variables?: Record<string, unknown>) =>
  execute({
    schema: buildGraphqlSchema(admin),
    document: parse(query),
    contextValue: createContext(admin),
    variableValues: variables ?? {},
  })

describe('GraphQL custom actions — schema shape', () => {
  test('generates a Mutation and a Query field per custom action', () => {
    const sdl = printSchema(buildGraphqlSchema(makeAdmin()))
    for (const field of ['usersSendMassPush', 'usersPing', 'usersTagAll']) {
      // Once under Query, once under Mutation.
      expect(sdl.split(`${field}(`).length - 1).toBe(2)
    }
  })

  test('args follow the actionType', () => {
    const sdl = printSchema(buildGraphqlSchema(makeAdmin()))
    expect(sdl).toContain('usersSendMassPush(payload: JSON): JSON')
    expect(sdl).toContain('usersPing(id: ID!, payload: JSON): JSON')
    expect(sdl).toContain('usersTagAll(ids: [ID!]!, payload: JSON): JSON')
  })

  test('built-in actions are not re-exposed as custom fields', () => {
    // `list`/`new`/`search`/`values` are themselves actionType 'resource', so
    // a naive filter by type would generate a second `usersList` (colliding
    // with the CRUD query) plus `usersNew`/`usersSearch`/`usersValues`.
    const sdl = printSchema(buildGraphqlSchema(makeAdmin()))
    for (const field of [
      'usersNew(',
      'usersSearch(',
      'usersValues(',
      'usersShow(',
      'usersEdit(',
      'usersBulkDelete(',
    ]) {
      expect(sdl).not.toContain(field)
    }
    // `usersList` exists exactly once — the CRUD query, never a mutation.
    expect(sdl.split('usersList(').length - 1).toBe(1)
    expect(sdl).toContain('createUsers(')
  })

  test('an action whose generated name collides is a hard error', () => {
    // `count` on `users` would generate `usersCount`, which the CRUD query
    // already owns. Silently overwriting it would break the count query, so
    // schema construction refuses instead.
    const tables = seed().tables
    const users = tables.find((t) => t.name === 'users')!
    const admin = new ModernAdmin({
      adapters: [{ Database: MemDatabase, Resource: MemResource }],
      resources: [
        {
          resource: users,
          options: {
            actions: {
              count: {
                name: 'count',
                actionType: 'resource' as const,
                handler: async () => ({}),
              },
            },
          },
        },
      ],
    })
    expect(() => buildGraphqlSchema(admin)).toThrow(/already taken/)
  })
})

describe('GraphQL custom actions — resolution', () => {
  test('mutation runs the handler with method "post" and the payload', async () => {
    const seen: Seen[] = []
    const admin = makeAdmin(seen)
    const res = await run(
      admin,
      'mutation { usersSendMassPush(payload: { title: "Hi", body: "There" }) }',
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.usersSendMassPush).toEqual({ sent: 2 })
    expect(seen[0]?.request.method).toBe('post')
    expect(seen[0]?.request.payload).toEqual({ title: 'Hi', body: 'There' })
    // Resource actions load neither record nor records.
    expect(seen[0]?.context.record).toBeUndefined()
    expect(seen[0]?.context.records).toBeUndefined()
  })

  test('query primes the handler with method "get"', async () => {
    const seen: Seen[] = []
    const admin = makeAdmin(seen)
    const res = await run(admin, '{ usersSendMassPush }')
    expect(res.errors).toBeUndefined()
    expect(res.data?.usersSendMassPush).toEqual({ templates: ['welcome'] })
    expect(seen[0]?.request.method).toBe('get')
  })

  test('record action receives the id and its loaded record', async () => {
    const seen: Seen[] = []
    const admin = makeAdmin(seen)
    const res = await run(admin, 'mutation { usersPing(id: "1") }')
    expect(res.errors).toBeUndefined()
    expect(res.data?.usersPing).toEqual({ pinged: '1' })
    expect(seen[0]?.request.params.recordId).toBe('1')
    expect(seen[0]?.context.record?.id()).toBe('1')
  })

  test('bulk action receives the selection as loaded records', async () => {
    const seen: Seen[] = []
    const admin = makeAdmin(seen)
    const res = await run(admin, 'mutation { usersTagAll(ids: ["1", "2"]) }')
    expect(res.errors).toBeUndefined()
    expect(res.data?.usersTagAll).toEqual({ tagged: ['1', '2'] })
    expect(seen[0]?.request.params.recordIds).toBe('1,2')
    expect(seen[0]?.context.records?.map((r) => r.id())).toEqual(['1', '2'])
  })

  test('payload is optional', async () => {
    const seen: Seen[] = []
    const admin = makeAdmin(seen)
    const res = await run(admin, 'mutation { usersSendMassPush }')
    expect(res.errors).toBeUndefined()
    expect(seen[0]?.request.payload).toEqual({})
  })

  test('variables carry through as the payload', async () => {
    const seen: Seen[] = []
    const admin = makeAdmin(seen)
    const res = await run(admin, 'mutation Run($p: JSON) { usersSendMassPush(payload: $p) }', {
      p: { title: 'From variables' },
    })
    expect(res.errors).toBeUndefined()
    expect(seen[0]?.request.payload).toEqual({ title: 'From variables' })
  })
})

describe('GraphQL custom actions — access control', () => {
  test('a denied action surfaces as a GraphQL error, not a silent success', async () => {
    const admin = makeAdmin()
    ;(
      admin.findResource('users').decorate().getAction('sendMassPush')!.merged as {
        isAccessible?: unknown
      }
    ).isAccessible = false

    const res = await run(admin, 'mutation { usersSendMassPush }')
    expect(res.errors?.[0]?.message).toContain('not accessible')
    expect(res.data?.usersSendMassPush).toBeNull()
  })

  test('the priming query is gated too', async () => {
    const admin = makeAdmin()
    ;(
      admin.findResource('users').decorate().getAction('sendMassPush')!.merged as {
        isAccessible?: unknown
      }
    ).isAccessible = false

    const res = await run(admin, '{ usersSendMassPush }')
    expect(res.errors?.[0]?.message).toContain('not accessible')
  })
})
