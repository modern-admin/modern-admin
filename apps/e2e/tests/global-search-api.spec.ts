import { test, expect } from '@playwright/test'

/**
 * Cross-resource search endpoint.
 *
 * `GET /admin/api/global-search?q=<term>` fans the query out to every
 * resource's `search` action through `ModernAdmin.invoke()` and groups
 * hits per resource. Per-resource access (api-key / role / `isAccessible`)
 * is honoured silently so denied resources just drop out of the response.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001'
const admin = (path: string): string => `${API}/admin/api${path}`

interface SearchResponse {
  query: string
  total: number
  groups: Array<{
    resourceId: string
    resourceName: string
    records: Array<{ resourceId: string; recordId: string; title: string }>
  }>
}

test.describe('GET /admin/api/global-search', () => {
  test('returns grouped hits across resources for a known term', async ({ request }) => {
    // "ada" appears in the seeded customer e-mails (`ada.lovelace1@example.com`
    // and friends) so we always have at least one matching customer.
    const res = await request.get(admin('/global-search?q=ada'))
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy()
    const body = (await res.json()) as SearchResponse
    expect(body.query).toBe('ada')
    expect(body.total).toBeGreaterThan(0)
    expect(body.groups.length).toBeGreaterThan(0)
    // The hit set must include customers.
    const customersGroup = body.groups.find((g) => g.resourceId === 'customers')
    expect(customersGroup, JSON.stringify(body.groups.map((g) => g.resourceId))).toBeDefined()
    expect(customersGroup!.records.length).toBeGreaterThan(0)
    expect(customersGroup!.records.length).toBeLessThanOrEqual(5) // default perResourceLimit
  })

  test('perResourceLimit caps the per-resource hits', async ({ request }) => {
    const res = await request.get(admin('/global-search?q=ada&perResourceLimit=2'))
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as SearchResponse
    for (const g of body.groups) {
      expect(g.records.length).toBeLessThanOrEqual(2)
    }
  })

  test('empty query is rejected (Zod min(1))', async ({ request }) => {
    const res = await request.get(admin('/global-search?q='))
    expect(res.status()).toBe(400)
  })

  test('unknown term returns total 0 with an empty groups array', async ({ request }) => {
    const res = await request.get(admin('/global-search?q=zzzzzznotarealsearchtoken'))
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as SearchResponse
    expect(body.total).toBe(0)
    expect(body.groups).toEqual([])
  })
})
