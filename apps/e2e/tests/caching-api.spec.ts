import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Backend cache coverage. The Playwright `webServer` env sets
 * `CACHE_BACKEND=memory`, which wires `MemoryCacheProvider` into
 * `apps/api`; without that, the demo defaults to `NoopCacheProvider`
 * and every `x-cache` header would read `MISS`.
 *
 * Behaviours under test:
 *   * GET responses are cached per `originalUrl` (`MISS` → `HIT`).
 *   * Mutations (POST/PATCH/DELETE) always bypass the cache.
 *   * Unknown resources never enter the cache path.
 *   * `new` / `edit` / `delete` / `bulkDelete` invalidate the right tags
 *     so subsequent reads return fresh data — including the headline
 *     split-tag promise: editing record A leaves record B's `show`
 *     cache intact (no umbrella `resource:<id>` flush).
 *   * Concurrent identical reads return identical payloads.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API}/admin/api${path}`

/** Wire-level header reader — Playwright normalises header names to lower-case. */
const xCache = (headers: Record<string, string>): string | undefined => headers['x-cache']

const uniqueSuffix = (label: string): string => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

const seedCustomer = async (
  request: APIRequestContext,
  label: string,
): Promise<{ id: string; email: string }> => {
  const suffix = uniqueSuffix(label)
  const email = `cache-${suffix}@example.com`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: {
      email,
      name: `Cache ${suffix}`,
      tier: 'pro',
      createdAt: new Date().toISOString(),
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return { id: body.record.id as string, email }
}

const removeCustomer = async (request: APIRequestContext, id: string): Promise<void> => {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

test.describe('HTTP cache — x-cache header semantics', () => {
  test('fresh GET emits MISS; repeat GET on the same URL emits HIT', async ({ request }) => {
    const url = adminApi(`/resources/customers/actions/list?_t=${uniqueSuffix('basic')}`)
    const first = await request.get(url)
    expect(first.ok()).toBeTruthy()
    expect(xCache(first.headers())).toBe('MISS')

    const second = await request.get(url)
    expect(second.ok()).toBeTruthy()
    expect(xCache(second.headers())).toBe('HIT')
  })

  test('mutation verbs always BYPASS the cache', async ({ request }) => {
    const { id } = await seedCustomer(request, 'bypass-create')
    // The POST that created the customer above also returned BYPASS, but
    // we re-check here on a different mutation verb so the assertion is
    // independent of seed wiring.
    const patched = await request.patch(
      adminApi(`/resources/customers/records/${id}/actions/edit`),
      { data: { name: 'bypassed' } },
    )
    expect(patched.ok()).toBeTruthy()
    expect(xCache(patched.headers())).toBe('BYPASS')

    const deleted = await request.delete(
      adminApi(`/resources/customers/records/${id}/actions/delete`),
    )
    expect(deleted.ok()).toBeTruthy()
    expect(xCache(deleted.headers())).toBe('BYPASS')
  })

  test('unknown resource bypasses the cache (interceptor defers to controller 404)', async ({ request }) => {
    const res = await request.get(adminApi('/resources/__does_not_exist__/actions/list'))
    expect(res.status()).toBe(404)
    expect(xCache(res.headers())).toBe('BYPASS')
  })
})

test.describe('Tag invalidation', () => {
  test('creating a record invalidates the list cache (list:<resource>)', async ({ request }) => {
    const url = adminApi(`/resources/customers/actions/list?_t=${uniqueSuffix('create-inv')}&perPage=100`)
    // Prime.
    expect(xCache((await request.get(url)).headers())).toBe('MISS')
    expect(xCache((await request.get(url)).headers())).toBe('HIT')

    const { id, email } = await seedCustomer(request, 'create-inv')
    try {
      const after = await request.get(url)
      expect(xCache(after.headers())).toBe('MISS')
      const body = await after.json()
      const emails = (body.records as Array<{ params: { email: string } }>).map((r) => r.params.email)
      expect(emails).toContain(email)
    } finally {
      await removeCustomer(request, id)
    }
  })

  test('editing record A invalidates show A but NOT show B (split-tag promise)', async ({ request }) => {
    const { id: idA } = await seedCustomer(request, 'split-a')
    const { id: idB } = await seedCustomer(request, 'split-b')
    const showA = adminApi(`/resources/customers/records/${idA}/actions/show`)
    const showB = adminApi(`/resources/customers/records/${idB}/actions/show`)
    try {
      // Prime both record caches.
      expect(xCache((await request.get(showA)).headers())).toBe('MISS')
      expect(xCache((await request.get(showB)).headers())).toBe('MISS')
      expect(xCache((await request.get(showA)).headers())).toBe('HIT')
      expect(xCache((await request.get(showB)).headers())).toBe('HIT')

      // Edit only A.
      const patched = await request.patch(
        adminApi(`/resources/customers/records/${idA}/actions/edit`),
        { data: { name: 'A renamed' } },
      )
      expect(patched.ok()).toBeTruthy()

      // A's show cache was tagged `record:customers:<idA>` and gets evicted.
      const aAfter = await request.get(showA)
      expect(xCache(aAfter.headers())).toBe('MISS')
      const aBody = await aAfter.json()
      expect(aBody.record.params.name).toBe('A renamed')

      // B's show cache was tagged `record:customers:<idB>` — independent of A.
      // The old umbrella `resource:<id>` tag would have wiped this; the new
      // scheme must not.
      const bAfter = await request.get(showB)
      expect(xCache(bAfter.headers())).toBe('HIT')
    } finally {
      await removeCustomer(request, idA)
      await removeCustomer(request, idB)
    }
  })

  test('editing a record also invalidates the list cache', async ({ request }) => {
    const { id } = await seedCustomer(request, 'edit-list')
    const listUrl = adminApi(`/resources/customers/actions/list?_t=${uniqueSuffix('edit-list')}`)
    try {
      expect(xCache((await request.get(listUrl)).headers())).toBe('MISS')
      expect(xCache((await request.get(listUrl)).headers())).toBe('HIT')

      const patched = await request.patch(
        adminApi(`/resources/customers/records/${id}/actions/edit`),
        { data: { name: 'edited again' } },
      )
      expect(patched.ok()).toBeTruthy()

      expect(xCache((await request.get(listUrl)).headers())).toBe('MISS')
    } finally {
      await removeCustomer(request, id)
    }
  })

  test('deleting a record invalidates both list and that record show', async ({ request }) => {
    const { id } = await seedCustomer(request, 'del-both')
    const listUrl = adminApi(`/resources/customers/actions/list?_t=${uniqueSuffix('del-both')}`)
    const showUrl = adminApi(`/resources/customers/records/${id}/actions/show`)
    // Prime list and show.
    expect(xCache((await request.get(listUrl)).headers())).toBe('MISS')
    expect(xCache((await request.get(showUrl)).headers())).toBe('MISS')
    expect(xCache((await request.get(listUrl)).headers())).toBe('HIT')
    expect(xCache((await request.get(showUrl)).headers())).toBe('HIT')

    const deleted = await request.delete(
      adminApi(`/resources/customers/records/${id}/actions/delete`),
    )
    expect(deleted.ok()).toBeTruthy()

    // list:<customers> invalidated → next list read misses.
    expect(xCache((await request.get(listUrl)).headers())).toBe('MISS')
    // record:<customers>:<id> invalidated → the now-deleted row 404s without
    // serving a stale cached body.
    const showAfter = await request.get(showUrl)
    expect(showAfter.status()).toBe(404)
  })

  test('bulkDelete invalidates the list cache and every targeted record', async ({ request }) => {
    const a = await seedCustomer(request, 'bulk-a')
    const b = await seedCustomer(request, 'bulk-b')
    const listUrl = adminApi(`/resources/customers/actions/list?_t=${uniqueSuffix('bulk')}`)
    const showA = adminApi(`/resources/customers/records/${a.id}/actions/show`)
    const showB = adminApi(`/resources/customers/records/${b.id}/actions/show`)
    // Prime everything.
    await request.get(listUrl)
    await request.get(showA)
    await request.get(showB)
    expect(xCache((await request.get(listUrl)).headers())).toBe('HIT')
    expect(xCache((await request.get(showA)).headers())).toBe('HIT')
    expect(xCache((await request.get(showB)).headers())).toBe('HIT')

    // The bulkDelete REST endpoint follows the resource-level pattern.
    const res = await request.post(
      adminApi('/resources/customers/actions/bulkDelete'),
      { data: { recordIds: [a.id, b.id] } },
    )
    expect(res.ok()).toBeTruthy()

    // All three caches must be invalidated: list, and one record tag per id.
    expect(xCache((await request.get(listUrl)).headers())).toBe('MISS')
    expect((await request.get(showA)).status()).toBe(404)
    expect((await request.get(showB)).status()).toBe(404)
  })
})

test.describe('In-flight dedup correctness', () => {
  test('concurrent identical reads return identical payloads', async ({ request }) => {
    const { id } = await seedCustomer(request, 'dedup')
    const url = adminApi(`/resources/customers/records/${id}/actions/show`)
    try {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => request.get(url)),
      )
      const bodies = await Promise.all(responses.map((r) => r.json()))
      const emails = new Set(bodies.map((b) => b.record.params.email as string))
      expect(emails.size).toBe(1)
      // After the storm settles, every observed x-cache value must be one
      // of the legitimate states — never undefined / never BYPASS for a
      // cacheable GET on a known resource.
      for (const r of responses) {
        expect(['HIT', 'MISS']).toContain(xCache(r.headers()))
      }
      // The next read should always be HIT — the storm has populated the
      // entry exactly once (the in-flight dedup guarantee — see
      // packages/core/src/actions/cache-runtime.ts).
      const trailing = await request.get(url)
      expect(xCache(trailing.headers())).toBe('HIT')
    } finally {
      await removeCustomer(request, id)
    }
  })
})
