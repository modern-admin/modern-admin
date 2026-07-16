import { describe, expect, test } from 'bun:test'
import { execute, parse } from 'graphql'
import { ModernAdmin } from '@modern-admin/core'
import { buildGraphqlSchema, createContext } from '../src/schema-builder.js'
import { MemDatabase, MemResource, seed } from './_helpers/in-memory.js'

const makeAdmin = () =>
  new ModernAdmin({
    databases: [seed()],
    adapters: [{
      Database: MemDatabase,
      Resource: MemResource,
    }],
  })

const run = async (admin: ModernAdmin, query: string, variables?: Record<string, unknown>) =>
  execute({
    schema: buildGraphqlSchema(admin),
    document: parse(query),
    contextValue: createContext(admin),
    variableValues: variables ?? {},
  })

describe('GraphQL schema', () => {
  test('exposes a list query that returns rows', async () => {
    const admin = makeAdmin()
    const result = await run(admin, '{ usersList { id name } }')
    expect(result.errors).toBeUndefined()
    expect(result.data?.usersList).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Alan' },
    ])
  })

  test('exposes a one query and returns null on miss', async () => {
    const admin = makeAdmin()
    const ok = await run(admin, '{ usersOne(id: "1") { id name } }')
    expect(ok.data?.usersOne).toEqual({ id: '1', name: 'Ada' })
    const miss = await run(admin, '{ usersOne(id: "999") { id } }')
    expect(miss.data?.usersOne).toBeNull()
  })

  test('count query returns total', async () => {
    const admin = makeAdmin()
    const result = await run(admin, '{ usersCount }')
    expect(result.data?.usersCount).toBe(2)
  })

  test('one/count enforce access through invoke (no raw findOne/count bypass)', async () => {
    // Deny the read actions; routing `usersOne`/`usersCount` through
    // `invoke()` means the gate fires instead of leaking rows via a direct
    // `findResource().findOne()/count()` (the IDOR the audit flagged).
    const admin = makeAdmin()
    ;(admin.findResource('users').decorate().getAction('show')!.merged as { isAccessible?: unknown })
      .isAccessible = false
    ;(admin.findResource('users').decorate().getAction('list')!.merged as { isAccessible?: unknown })
      .isAccessible = false

    const one = await run(admin, '{ usersOne(id: "1") { id name } }')
    expect(one.errors?.[0]?.message).toContain('not accessible')
    expect(one.data?.usersOne ?? null).toBeNull()

    const count = await run(admin, '{ usersCount }')
    expect(count.errors?.[0]?.message).toContain('not accessible')
  })

  test('create mutation persists a new record', async () => {
    const admin = makeAdmin()
    const result = await run(
      admin,
      'mutation($input: UsersCreateInput!) { createUsers(input: $input) { id name } }',
      { input: { name: 'Grace' } },
    )
    expect(result.errors).toBeUndefined()
    expect((result.data?.createUsers as { name: string }).name).toBe('Grace')
    const list = await run(admin, '{ usersList { id name } }')
    expect((list.data?.usersList as unknown[]).length).toBe(3)
  })

  test('update mutation patches a record', async () => {
    const admin = makeAdmin()
    const result = await run(
      admin,
      'mutation($id: ID!, $input: UsersUpdateInput!) { updateUsers(id: $id, input: $input) { id name } }',
      { id: '1', input: { name: 'Ada Lovelace' } },
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.updateUsers).toEqual({ id: '1', name: 'Ada Lovelace' })
  })

  test('delete mutation removes a record', async () => {
    const admin = makeAdmin()
    const result = await run(admin, 'mutation { deleteUsers(id: "2") }')
    expect(result.errors).toBeUndefined()
    expect(result.data?.deleteUsers).toBe(true)
    const list = await run(admin, '{ usersList { id } }')
    expect(list.data?.usersList).toEqual([{ id: '1' }])
  })

  test('reference fields resolve via DataLoader', async () => {
    const admin = makeAdmin()
    const result = await run(
      admin,
      '{ postsList { id title authorId authorIdRef { id name } } }',
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.postsList).toEqual([
      { id: '1', title: 'Hello', authorId: '1', authorIdRef: { id: '1', name: 'Ada' } },
      { id: '2', title: 'World', authorId: '2', authorIdRef: { id: '2', name: 'Alan' } },
    ])
  })

  test('reference expansion respects access on the referenced resource', async () => {
    // Deny `show` on `users`: the `authorIdRef` expansion routes through
    // `invoke('show')` on `users`, so it must resolve to null instead of
    // leaking the referenced user (the reference-resolver IDOR). The scalar
    // `authorId` (owned by `posts`) still comes through, and the query as a
    // whole does not error.
    const admin = makeAdmin()
    ;(admin.findResource('users').decorate().getAction('show')!.merged as { isAccessible?: unknown })
      .isAccessible = false
    const result = await run(
      admin,
      '{ postsList { id authorId authorIdRef { id name } } }',
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.postsList).toEqual([
      { id: '1', authorId: '1', authorIdRef: null },
      { id: '2', authorId: '2', authorIdRef: null },
    ])
  })

  test('introspection reports all expected operations', async () => {
    const admin = makeAdmin()
    const result = await run(
      admin,
      '{ __schema { queryType { fields { name } } mutationType { fields { name } } } }',
    )
    type FieldList = { fields: Array<{ name: string }> }
    const data = result.data?.__schema as { queryType: FieldList; mutationType: FieldList }
    const queryNames = data.queryType.fields.map((f) => f.name).sort()
    const mutationNames = data.mutationType.fields.map((f) => f.name).sort()
    expect(queryNames).toContain('usersList')
    expect(queryNames).toContain('postsList')
    expect(queryNames).toContain('_status')
    expect(mutationNames).toContain('createUsers')
    expect(mutationNames).toContain('updatePosts')
    expect(mutationNames).toContain('deletePosts')
  })

  test('schema with no resources still builds and exposes _status', async () => {
    const admin = new ModernAdmin({})
    const result = await run(admin, '{ _status }')
    expect(result.data?._status).toBe('ok')
  })
})
