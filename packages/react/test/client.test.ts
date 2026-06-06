import { describe, expect, it, mock } from 'bun:test'
import { AdminClient } from '../src/client.js'

describe('AdminClient.timeseries', () => {
  it('serializes date-only ranges as ISO datetimes', async () => {
    const originalFetch = globalThis.fetch
    let body: Record<string, unknown> | undefined
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ series: [], supported: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      const client = new AdminClient({ baseUrl: 'https://example.test' })
      await client.timeseries({
        resource: 'users',
        dateField: 'createdAt',
        step: 'day',
        metric: 'count',
        from: '2026-05-01',
        to: '2026-05-09',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(body?.from).toBe('2026-05-01T00:00:00.000Z')
    expect(body?.to).toBe('2026-05-09T23:59:59.999Z')
  })
})
