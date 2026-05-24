import { describe, expect, test } from 'bun:test'
import { execute, parse, subscribe } from 'graphql'
import {
  InMemoryRealtimeBus,
  ModernAdmin,
  type BaseDatabase,
  type BaseResource,
  type RealtimeEvent,
} from '@modern-admin/core'
import { buildGraphqlSchema, createContext } from '../src/schema-builder.js'
import { createRealtimeAsyncIterator } from '../src/subscription-iterator.js'
import { MemDatabase, MemResource, seed } from './_helpers/in-memory.js'

const makeAdmin = () =>
  new ModernAdmin({
    databases: [seed()],
    adapters: [
      {
        Database: MemDatabase as unknown as typeof BaseDatabase,
        Resource: MemResource as unknown as typeof BaseResource,
      },
    ],
  })

const sampleEvent = (overrides: Partial<RealtimeEvent> = {}): RealtimeEvent => ({
  kind: 'created',
  resourceId: 'users',
  recordId: '42',
  record: { id: '42', name: 'Grace' },
  at: 1700000000000,
  ...overrides,
})

describe('GraphQL subscriptions', () => {
  test('schema exposes a *Events subscription field per resource', () => {
    const schema = buildGraphqlSchema(makeAdmin())
    const subType = schema.getSubscriptionType()
    expect(subType).not.toBeNull()
    const fields = subType!.getFields()
    expect(Object.keys(fields).sort()).toEqual(['postsEvents', 'usersEvents'])
  })

  test('introspection includes the Subscription root', async () => {
    const admin = makeAdmin()
    const result = await execute({
      schema: buildGraphqlSchema(admin),
      document: parse('{ __schema { subscriptionType { fields { name } } } }'),
      contextValue: createContext(admin),
    })
    type FieldList = { fields: Array<{ name: string }> }
    const data = result.data?.__schema as { subscriptionType: FieldList }
    const names = data.subscriptionType.fields.map((f) => f.name).sort()
    expect(names).toEqual(['postsEvents', 'usersEvents'])
  })

  test('subscribe() yields bus events filtered by resourceId', async () => {
    const admin = makeAdmin()
    const bus = new InMemoryRealtimeBus()
    const iter = await subscribe({
      schema: buildGraphqlSchema(admin),
      document: parse(
        'subscription { usersEvents { kind resourceId recordId record at } }',
      ),
      contextValue: createContext(admin, undefined, bus),
    })
    if (!(Symbol.asyncIterator in iter)) {
      throw new Error('expected AsyncIterable for subscription operation')
    }
    const it = iter as AsyncIterableIterator<{
      data?: { usersEvents: RealtimeEvent }
      errors?: unknown
    }>

    // Publish one matching + one non-matching event. The posts event must be
    // filtered out so the iterator's first yield is for the users one.
    await bus.publish(sampleEvent({ resourceId: 'posts', recordId: '7' }))
    await bus.publish(sampleEvent({ recordId: '42', record: { id: '42', name: 'Grace' } }))

    const next = await it.next()
    expect(next.done).toBe(false)
    expect(next.value.errors).toBeUndefined()
    expect(next.value.data?.usersEvents).toEqual({
      kind: 'created',
      resourceId: 'users',
      recordId: '42',
      record: { id: '42', name: 'Grace' },
      at: 1700000000000,
    })

    await it.return?.()
  })

  test('kind argument narrows the event stream', async () => {
    const admin = makeAdmin()
    const bus = new InMemoryRealtimeBus()
    const iter = await subscribe({
      schema: buildGraphqlSchema(admin),
      document: parse(
        'subscription { usersEvents(kind: "deleted") { kind recordId } }',
      ),
      contextValue: createContext(admin, undefined, bus),
    })
    if (!(Symbol.asyncIterator in iter)) throw new Error('expected AsyncIterable')
    const it = iter as AsyncIterableIterator<{
      data?: { usersEvents: { kind: string; recordId: string } }
    }>

    await bus.publish(sampleEvent({ kind: 'created', recordId: '1' }))
    await bus.publish(sampleEvent({ kind: 'updated', recordId: '2' }))
    await bus.publish(sampleEvent({ kind: 'deleted', recordId: '3' }))

    const next = await it.next()
    expect(next.value.data?.usersEvents).toEqual({ kind: 'deleted', recordId: '3' })
    await it.return?.()
  })

  test('subscribe without a bus surfaces an actionable error', async () => {
    const admin = makeAdmin()
    const result = await subscribe({
      schema: buildGraphqlSchema(admin),
      document: parse('subscription { usersEvents { kind } }'),
      contextValue: createContext(admin),
    })
    if (Symbol.asyncIterator in result) {
      throw new Error('expected ExecutionResult when subscribe throws synchronously')
    }
    expect(result.errors).toBeDefined()
    expect(result.errors?.[0]?.message).toContain('realtime bus')
  })

  test('iterator return() unsubscribes from the bus', async () => {
    const bus = new InMemoryRealtimeBus()
    const iter = createRealtimeAsyncIterator(bus, { resourceId: 'users' })

    // Wait one microtask so the async subscribe() in the iterator resolves.
    await Promise.resolve()
    await Promise.resolve()

    await iter.return?.()

    // After teardown, publishing more events should not enqueue anything.
    await bus.publish(sampleEvent({ recordId: 'x' }))
    const after = await iter.next()
    expect(after.done).toBe(true)
  })
})
