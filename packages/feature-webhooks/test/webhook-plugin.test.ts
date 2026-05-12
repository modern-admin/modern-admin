import { describe, expect, it } from 'bun:test'
import { MemoryWebhookStore } from '@modern-admin/core'
import type { ActionRequest, ActionResponse, ResourceOptions } from '@modern-admin/core'
import { eventMatches, filtersMatch, projectRecord } from '../src/matcher.js'
import { NoopWebhookDispatcher } from '../src/noop-dispatcher.js'
import { webhookPlugin } from '../src/webhook-plugin.js'

type AfterHook = (
  response: ActionResponse,
  request: ActionRequest,
  context: unknown,
) => Promise<ActionResponse> | ActionResponse

const getAfter = (actions: ResourceOptions['actions'], name: string): AfterHook[] =>
  ((actions?.[name] as { after?: AfterHook[] })?.after ?? []) as AfterHook[]

const fakeRequest = (action: string): ActionRequest => ({
  method: 'post',
  params: { resourceId: 'users', action, recordId: '1' },
})

const fakeContext = (params: Record<string, unknown> = {}) => ({
  resource: { decorate: () => ({ id: 'users' }) },
  record: { id: '1', params },
  currentAdmin: { id: 'admin-1' },
})

describe('webhook matcher', () => {
  it('matches exact and wildcard event names', () => {
    expect(eventMatches(['users.updated'], 'users.updated')).toBe(true)
    expect(eventMatches(['users.*'], 'users.updated')).toBe(true)
    expect(eventMatches(['record.updated'], 'users.updated')).toBe(true)
    expect(eventMatches(['posts.*'], 'users.updated')).toBe(false)
  })

  it('matches filters and projects fields', () => {
    expect(filtersMatch({ status: 'active' }, { status: 'active' })).toBe(true)
    expect(filtersMatch({ status: 'active' }, { status: 'blocked' })).toBe(false)
    expect(projectRecord({ a: 1, b: 2 }, ['b'])).toEqual({ b: 2 })
  })
})

describe('webhookPlugin', () => {
  it('enqueues matching webhooks after a mutation', async () => {
    const store = new MemoryWebhookStore()
    const dispatcher = new NoopWebhookDispatcher()
    await store.create({
      name: 'Users',
      url: 'https://example.test/webhook',
      events: ['users.created'],
      payloadFields: ['email'],
    })
    const options = webhookPlugin({ store, dispatcher }).apply({}, {} as never)
    const hook = getAfter(options.actions, 'new')[0]!
    await hook(
      { record: { id: '1', params: { email: 'a@example.test', name: 'Alice' } } },
      fakeRequest('new'),
      fakeContext(),
    )
    expect(dispatcher.jobs).toHaveLength(1)
    expect(dispatcher.jobs[0]!.payload).toMatchObject({
      event: 'users.created',
      resourceId: 'users',
      recordId: '1',
      actorId: 'admin-1',
      record: { email: 'a@example.test' },
    })
  })
})
