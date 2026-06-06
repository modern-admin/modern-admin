import { expect, test } from '@playwright/test'

/**
 * Regression coverage for the numeric filter operators on the list action.
 *
 * The frontend encodes numeric filters as `OPERATOR:value` strings, e.g.
 *   filters[rating]=between:3,3.1
 *   filters[rating]=gt:4
 *   filters[rating]=eq:5
 *
 * The server-side Filter parser must strip the operator prefix so the adapter
 * receives a typed scalar (or `{from, to}` for ranges). Previously the Prisma
 * adapter forwarded the raw `"between:3,3.1"` string straight to `equals`,
 * which Prisma rejected for Float columns with a 500.
 *
 * Tests target the `posts` resource because its `rating` column is `Float?`
 * — the original repro case from the bug report.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

const RATING = 'rating'

test.describe('List filters — numeric operators', () => {
  test('between:from,to returns rows inside the range (no 500)', async ({ request }) => {
    const res = await request.get(
      adminApi(`/resources/posts/actions/list?filters[${RATING}]=between:3,3.1&perPage=200`),
    )
    expect(res.status(), await res.text().catch(() => '')).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { rating: number | null } }>
    for (const r of records) {
      const v = r.params.rating
      if (v == null) continue
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(3.1)
    }
  })

  test('gt:value returns only rows strictly greater', async ({ request }) => {
    const res = await request.get(
      adminApi(`/resources/posts/actions/list?filters[${RATING}]=gt:4&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { rating: number | null } }>
    expect(records.length).toBeGreaterThan(0)
    for (const r of records) {
      const v = r.params.rating
      if (v == null) continue
      expect(v).toBeGreaterThan(4)
    }
  })

  test('lt:value returns only rows strictly less', async ({ request }) => {
    const res = await request.get(
      adminApi(`/resources/posts/actions/list?filters[${RATING}]=lt:1&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { rating: number | null } }>
    for (const r of records) {
      const v = r.params.rating
      if (v == null) continue
      expect(v).toBeLessThan(1)
    }
  })

  test('eq:value matches the exact numeric value', async ({ request }) => {
    // Pick an existing rating value from the seeded data, then filter by it.
    const all = await request.get(adminApi('/resources/posts/actions/list?perPage=200'))
    expect(all.status()).toBe(200)
    const seedBody = await all.json()
    const sample = (seedBody.records as Array<{ params: { rating: number | null } }>)
      .map((r) => r.params.rating)
      .find((v): v is number => typeof v === 'number')
    expect(sample, 'seeded posts should include at least one numeric rating').toBeDefined()

    const res = await request.get(
      adminApi(`/resources/posts/actions/list?filters[${RATING}]=eq:${sample}&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { rating: number | null } }>
    expect(records.length).toBeGreaterThan(0)
    for (const r of records) {
      expect(r.params.rating).toBe(sample)
    }
  })

  test('between with only from acts as gte', async ({ request }) => {
    const res = await request.get(
      adminApi(`/resources/posts/actions/list?filters[${RATING}]=between:4.5,&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { rating: number | null } }>
    for (const r of records) {
      const v = r.params.rating
      if (v == null) continue
      expect(v).toBeGreaterThanOrEqual(4.5)
    }
  })
})
