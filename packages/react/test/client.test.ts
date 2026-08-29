import { describe, expect, it, mock } from 'bun:test'
import { AdminClient } from '../src/client.js'

describe('AdminClient.timeseries', () => {
  it('serializes date-only ranges as ISO datetimes', async () => {
    let body: Record<string, unknown> | undefined
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ series: [], supported: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const client = new AdminClient({
      baseUrl: 'https://example.test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })
    await client.timeseries({
      resource: 'users',
      dateField: 'createdAt',
      step: 'day',
      metric: 'count',
      from: '2026-05-01',
      to: '2026-05-09',
    })

    expect(body?.from).toBe('2026-05-01T00:00:00.000Z')
    expect(body?.to).toBe('2026-05-09T23:59:59.999Z')
  })
})

/** Captures the URL + init of every fetch made while `run` executes. */
const captureRequests = async (
  run: (client: AdminClient) => Promise<unknown>,
): Promise<Array<{ url: string; init?: RequestInit }>> => {
  const seen: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    seen.push({ url: String(input), ...(init ? { init } : {}) })
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  await run(new AdminClient({ baseUrl: 'https://example.test', fetchImpl }))
  return seen
}

describe('AdminClient — audit log', () => {
  it('serializes both parts of a composite cursor', async () => {
    const [req] = await captureRequests((client) =>
      client.listAuditLog({ before: 1_700_000_000_000, beforeId: 'cursor-id' }),
    )

    expect(req?.url).toBe(
      'https://example.test/admin/api/audit-log?before=1700000000000&beforeId=cursor-id',
    )
  })
})

describe('AdminClient — injectable boundaries', () => {
  it('uses provider-specific auth paths', async () => {
    const seen: string[] = []
    const client = new AdminClient({
      baseUrl: 'https://example.test',
      authPaths: {
        emailSignIn: '/session/login',
        socialSignIn: '/session/oauth',
        signOut: '/session/logout',
      },
      navigate: () => undefined,
      fetchImpl: async (input) => {
        seen.push(String(input))
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    await client.login('admin@example.test', 'secret')
    await client.loginSocial('example', 'https://app.test/callback')
    await client.logout()

    expect(seen).toEqual([
      'https://example.test/session/login',
      'https://example.test/session/oauth',
      'https://example.test/session/logout',
    ])
  })
})

describe('AdminClient — custom actions', () => {
  it('POSTs a resource action with the payload as the body', async () => {
    const [req] = await captureRequests((c) =>
      c.invokeResourceAction('users', 'sendMassPush', { title: 'Hi' }),
    )
    expect(req?.url).toBe('https://example.test/admin/api/resources/users/actions/sendMassPush')
    expect(req?.init?.method).toBe('POST')
    expect(JSON.parse(String(req?.init?.body))).toEqual({ title: 'Hi' })
  })

  it('POSTs a record action with the payload as the body', async () => {
    const [req] = await captureRequests((c) =>
      c.invokeRecordAction('users', '42', 'sendFirebase', { title: 'Hi' }),
    )
    expect(req?.url).toBe(
      'https://example.test/admin/api/resources/users/records/42/actions/sendFirebase',
    )
    expect(req?.init?.method).toBe('POST')
    expect(JSON.parse(String(req?.init?.body))).toEqual({ title: 'Hi' })
  })

  it('POSTs a bulk action with the selection alongside the payload', async () => {
    const [req] = await captureRequests((c) =>
      c.invokeBulkAction('users', 'tagAll', ['1', '2'], { tag: 'vip' }),
    )
    expect(req?.url).toBe('https://example.test/admin/api/resources/users/actions/tagAll')
    expect(req?.init?.method).toBe('POST')
    expect(JSON.parse(String(req?.init?.body))).toEqual({
      tag: 'vip',
      recordIds: ['1', '2'],
    })
  })

  it('a bulk payload cannot clobber recordIds', async () => {
    // `recordIds` is what the server routes on — a stray payload key of the
    // same name must not win, or the action would target the wrong rows.
    const [req] = await captureRequests((c) =>
      c.invokeBulkAction('users', 'tagAll', ['1'], { recordIds: ['999'] }),
    )
    expect(JSON.parse(String(req?.init?.body))).toEqual({ recordIds: ['1'] })
  })

  it('primes a resource action with a GET', async () => {
    const [req] = await captureRequests((c) => c.fetchResourceAction('users', 'sendMassPush'))
    expect(req?.url).toBe('https://example.test/admin/api/resources/users/actions/sendMassPush')
    // No explicit method → fetch defaults to GET, which is what the server
    // route matches. A body here would be a bug.
    expect(req?.init?.method).toBeUndefined()
    expect(req?.init?.body).toBeUndefined()
  })

  it('appends query params to a priming GET', async () => {
    const [req] = await captureRequests((c) =>
      c.fetchResourceAction('users', 'sendMassPush', { preview: '1' }),
    )
    expect(req?.url).toBe(
      'https://example.test/admin/api/resources/users/actions/sendMassPush?preview=1',
    )
  })

  it('primes a record action with a GET', async () => {
    const [req] = await captureRequests((c) => c.fetchRecordAction('users', '42', 'sendFirebase'))
    expect(req?.url).toBe(
      'https://example.test/admin/api/resources/users/records/42/actions/sendFirebase',
    )
  })

  it('encodes ids and action names into the path', async () => {
    const [req] = await captureRequests((c) => c.fetchRecordAction('a b', 'x/y', 'send push'))
    expect(req?.url).toBe(
      'https://example.test/admin/api/resources/a%20b/records/x%2Fy/actions/send%20push',
    )
  })
})

describe('AdminClient.list', () => {
  it('sends no cache-busting hints by default', async () => {
    const [req] = await captureRequests((c) => c.list('users', { page: 2 }))
    expect(req?.url).toBe('https://example.test/admin/api/resources/users/actions/list?page=2')
    const headers = req?.init?.headers as Record<string, string> | undefined
    expect(headers?.['Cache-Control']).toBeUndefined()
    expect(req?.init?.cache).toBeUndefined()
  })

  it('asks every cache in the chain to revalidate when refreshing', async () => {
    const [req] = await captureRequests((c) => c.list('users', { page: 2 }, { refresh: true }))
    // Same URL — the refresh travels as a header so the server-side cache
    // key stays stable and the fresh body replaces the stale entry.
    expect(req?.url).toBe('https://example.test/admin/api/resources/users/actions/list?page=2')
    const headers = req?.init?.headers as Record<string, string> | undefined
    expect(headers?.['Cache-Control']).toBe('no-cache')
    expect(req?.init?.cache).toBe('no-store')
  })
})

describe('AdminClient cache diagnostics', () => {
  it('reads and resets replica metrics', async () => {
    const requests = await captureRequests(async (client) => {
      await client.cacheStats()
      await client.resetCacheStats()
    })
    expect(requests[0]?.url).toBe('https://example.test/admin/api/cache/stats')
    expect(requests[0]?.init?.method).toBeUndefined()
    expect(requests[1]?.url).toBe('https://example.test/admin/api/cache/stats/reset')
    expect(requests[1]?.init?.method).toBe('POST')
  })

  it('posts the selected resource for invalidation', async () => {
    const [request] = await captureRequests((client) =>
      client.invalidateResourceCache('customer groups'),
    )
    expect(request?.url).toBe('https://example.test/admin/api/cache/invalidate')
    expect(request?.init?.method).toBe('POST')
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      resourceId: 'customer groups',
    })
  })
})
