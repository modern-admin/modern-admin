import { afterEach, describe, expect, it, mock } from 'bun:test'
import { MemoryWebhookStore } from '@modern-admin/core'
import { deliverWebhookJob, signPayload } from '../src/delivery.js'
import type { WebhookJob } from '../src/types.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('webhook delivery', () => {
  it('signs the request and prevents custom headers from overriding system headers', async () => {
    const store = new MemoryWebhookStore()
    const webhook = await store.create({
      name: 'Hook',
      url: 'https://example.test/webhook',
      events: ['users.created'],
      secret: 'super-secret',
      headers: {
        'X-Custom': 'ok',
        'X-Modern-Admin-Signature': 'bad',
      },
    })
    let headers: Headers | undefined
    const fetchMock = mock(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      headers = new Headers(init?.headers)
      return new Response('ok', { status: 200 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const job: WebhookJob = {
      webhookId: webhook.id,
      event: 'users.created',
      payload: {
        id: 'evt-1',
        event: 'users.created',
        resourceId: 'users',
        recordId: '1',
        occurredAt: '2026-05-09T00:00:00.000Z',
        record: { email: 'a@example.test' },
      },
    }
    await deliverWebhookJob(store, job, 1)
    const body = JSON.stringify(job.payload)

    expect(headers?.get('X-Custom')).toBe('ok')
    expect(headers?.get('X-Modern-Admin-Event')).toBe('users.created')
    expect(headers?.get('X-Modern-Admin-Delivery')).toBe('evt-1')
    expect(headers?.get('X-Modern-Admin-Signature')).toBe(signPayload('super-secret', body))
    expect(store.deliveries[0]!.status).toBe('success')
  })

  it('records a failed attempt and throws so BullMQ can retry', async () => {
    const store = new MemoryWebhookStore()
    const webhook = await store.create({
      name: 'Hook',
      url: 'https://example.test/webhook',
      events: ['users.created'],
    })
    globalThis.fetch = mock(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch

    await expect(deliverWebhookJob(store, {
      webhookId: webhook.id,
      event: 'users.created',
      payload: {
        id: 'evt-2',
        event: 'users.created',
        resourceId: 'users',
        recordId: '1',
        occurredAt: '2026-05-09T00:00:00.000Z',
        record: {},
      },
    }, 2)).rejects.toThrow('HTTP 500')

    expect(store.deliveries[0]).toMatchObject({
      webhookId: webhook.id,
      status: 'failed',
      responseStatus: 500,
      attempt: 2,
    })
  })
})
