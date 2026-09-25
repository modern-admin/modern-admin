import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test'

/**
 * An API key authenticates as its owner (Better Auth's api-key plugin mints a
 * session for the key's user); only the key's `resource × action` allowlist,
 * enforced by `ModernAdmin.invoke()`, narrows it. This spec pins that a
 * narrowly scoped key cannot use its owner's session anywhere else:
 *
 *   - admin endpoints outside `invoke()` (audit log, history, dashboard,
 *     webhooks) answer 403 instead of serving the owner's data;
 *   - Better Auth's own endpoints answer 403 instead of exposing the owner's
 *     live sessions or minting an unrestricted key.
 *
 * It also pins that a key survives ordinary use: each admin request verifies
 * the key once (it used to be twice, which halved the plugin's per-key rate
 * limit), and keys with an expiry can be created at all (the expiry used to
 * be sent in milliseconds where Better Auth expects seconds).
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const admin = (path: string): string => `${API}/admin/api${path}`

interface CreatedKey {
  key: string
  record: { id: string; expiresAt: string | null }
}

const createdKeyIds: string[] = []

/** Create a key through the owner's session (the `api` project's storageState). */
const createKey = async (
  request: APIRequestContext,
  permissions: Record<string, string[]>,
  expiresInDays: number | null = null,
): Promise<CreatedKey> => {
  const res = await request.post(admin('/api-keys'), {
    data: { name: `e2e-scope-${Date.now()}`, expiresInDays, permissions },
  })
  expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
  const body = (await res.json()) as CreatedKey
  createdKeyIds.push(body.record.id)
  return body
}

/** A context with no cookies at all: the key is the only credential. */
const keyContext = (key: string): Promise<APIRequestContext> =>
  playwrightRequest.newContext({
    extraHTTPHeaders: { 'x-api-key': key },
    storageState: { cookies: [], origins: [] },
  })

test.afterAll(async ({ request }) => {
  for (const id of createdKeyIds) await request.delete(admin(`/api-keys/${id}`))
})

test.describe('API key scope', () => {
  test('a list-only key reaches its resource and nothing else in the admin API', async ({
    request,
  }) => {
    const { key } = await createKey(request, { customers: ['list'] })
    const api = await keyContext(key)
    try {
      const me = await api.get(admin('/auth/me'))
      expect(me.status()).toBe(200)
      expect(((await me.json()) as { user: { apiKey?: unknown } }).user.apiKey).toMatchObject({
        permissions: { customers: ['list'] },
      })

      expect((await api.get(admin('/resources/customers/actions/list?perPage=1'))).status()).toBe(
        200,
      )
      // Outside the key's allowlist — the core gate.
      expect((await api.get(admin('/resources/products/actions/list?perPage=1'))).status()).toBe(
        403,
      )
      // Outside `invoke()` — the transport guard.
      expect((await api.get(admin('/audit-log?limit=1'))).status()).toBe(403)
      expect((await api.get(admin('/dashboard'))).status()).toBe(403)
    } finally {
      await api.dispose()
    }
  })

  test('record history and webhooks refuse the key', async ({ request }) => {
    const list = await request.get(admin('/resources/customers/actions/list?perPage=1'))
    const customerId = ((await list.json()) as { records: Array<{ id: string }> }).records[0]?.id
    expect(customerId).toBeTruthy()

    const { key } = await createKey(request, { customers: ['*'] })
    const api = await keyContext(key)
    try {
      expect(
        (await api.get(admin(`/resources/customers/records/${customerId}/history`))).status(),
      ).toBe(403)
      expect((await api.get(admin('/webhooks'))).status()).toBe(403)
    } finally {
      await api.dispose()
    }
  })

  test('a key with an expiry is created and works', async ({ request }) => {
    const before = Date.now()
    const { key, record } = await createKey(request, { customers: ['list'] }, 30)
    const expiresAt = Date.parse(record.expiresAt ?? '')
    const day = 24 * 60 * 60 * 1000
    expect(expiresAt).toBeGreaterThan(before + 29 * day)
    expect(expiresAt).toBeLessThan(Date.now() + 31 * day)

    const api = await keyContext(key)
    try {
      expect((await api.get(admin('/auth/me'))).status()).toBe(200)
    } finally {
      await api.dispose()
    }
  })

  test('a key serves more than a handful of requests', async ({ request }) => {
    const { key } = await createKey(request, { customers: ['list'] })
    const api = await keyContext(key)
    try {
      // Under the plugin's default limit (10 per day) charged twice per
      // request, the sixth request here was already refused.
      for (let i = 0; i < 15; i++) {
        const res = await api.get(admin('/resources/customers/actions/list?perPage=1'))
        expect(res.status(), `request ${i + 1}`).toBe(200)
      }
    } finally {
      await api.dispose()
    }
  })

  test('Better Auth endpoints refuse the key', async ({ request }) => {
    const { key } = await createKey(request, { customers: ['list'] })
    const api = await keyContext(key)
    try {
      for (const path of ['/get-session', '/list-sessions', '/api-key/list']) {
        const res = await api.get(`${API}/api/auth${path}`)
        expect(res.status(), path).toBe(403)
        expect(await res.json(), path).toMatchObject({ code: 'API_KEY_NOT_ALLOWED' })
      }
      const mint = await api.post(`${API}/api/auth/api-key/create`, {
        data: { name: 'escalated' },
        headers: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' },
      })
      expect(mint.status()).toBe(403)
    } finally {
      await api.dispose()
    }
  })
})
