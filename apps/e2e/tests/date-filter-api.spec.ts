import { expect, test } from '@playwright/test'

/**
 * Date-range filter coverage for DateTime columns on the list action.
 *
 * The frontend encodes date filters in two flavors:
 *
 *   1. Range qualifier (legacy / list page DatePicker pair):
 *        filters[createdAt~~from]=YYYY-MM-DD
 *        filters[createdAt~~to]=YYYY-MM-DD
 *      The Filter constructor pairs these into `{from, to}` and the adapter
 *      translates to `{gte, lte}`.
 *
 *   2. Explicit `between:` operator (single param, comma-separated):
 *        filters[createdAt]=between:YYYY-MM-DD,YYYY-MM-DD
 *      The Filter parser strips the prefix and the adapter forwards `gte/lte`.
 *
 * Both shapes must coerce the bound to a `Date` before reaching Prisma —
 * raw strings would 500 on a DateTime column.
 *
 * Tests target the `customers` resource because `createdAt` is non-nullable
 * (`@default(now())` on every seeded row).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

const COL = 'createdAt'

interface Row {
  id: string
  params: { createdAt: string | null }
}

test.describe('List filters — date-range operators (customers.createdAt)', () => {
  test('~~from / ~~to range returns only rows inside the window (no 500)', async ({
    request,
  }) => {
    // Pull a sample to find the actual date span seeded into the demo DB.
    const sample = await request.get(adminApi(`/resources/customers/actions/list?perPage=200`))
    expect(sample.status(), await sample.text().catch(() => '')).toBe(200)
    const all = ((await sample.json()).records as Row[])
      .map((r) => r.params.createdAt)
      .filter((v): v is string => !!v)
      .sort()
    expect(all.length, 'seed should include at least one row').toBeGreaterThan(0)

    // Build a window that includes the EARLIEST seed value but excludes the
    // latest by ~1 day. Using a window past today (well after seed dates)
    // guarantees a strictly-smaller subset.
    const earliest = all[0]!.slice(0, 10) // yyyy-MM-dd
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const res = await request.get(
      adminApi(
        `/resources/customers/actions/list?filters[${COL}~~from]=${earliest}&filters[${COL}~~to]=${tomorrowIso}&perPage=200`,
      ),
    )
    expect(res.status(), await res.text().catch(() => '')).toBe(200)

    const records = (await res.json()).records as Row[]
    expect(records.length).toBeGreaterThan(0)
    for (const r of records) {
      if (!r.params.createdAt) continue
      const day = r.params.createdAt.slice(0, 10)
      expect(day >= earliest).toBe(true)
      expect(day <= tomorrowIso).toBe(true)
    }
  })

  test('~~from alone filters as gte (no upper bound)', async ({ request }) => {
    const farFuture = '2999-12-31'
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}~~from]=${farFuture}&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const records = (await res.json()).records as Row[]
    // Nothing is dated after 2999 in the seed.
    expect(records.length).toBe(0)
  })

  test('~~to alone filters as lte (no lower bound)', async ({ request }) => {
    const farPast = '1900-01-01'
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}~~to]=${farPast}&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const records = (await res.json()).records as Row[]
    // Nothing is dated before 1900 in the seed.
    expect(records.length).toBe(0)
  })

  test('between:from,to operator behaves like the ~~from/~~to pair', async ({ request }) => {
    const sample = await request.get(adminApi(`/resources/customers/actions/list?perPage=200`))
    expect(sample.status()).toBe(200)
    const all = ((await sample.json()).records as Row[])
      .map((r) => r.params.createdAt)
      .filter((v): v is string => !!v)
      .sort()
    const earliest = all[0]!.slice(0, 10)
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const res = await request.get(
      adminApi(
        `/resources/customers/actions/list?filters[${COL}]=between:${earliest},${tomorrowIso}&perPage=200`,
      ),
    )
    expect(res.status(), await res.text().catch(() => '')).toBe(200)
    const records = (await res.json()).records as Row[]
    expect(records.length).toBeGreaterThan(0)
    for (const r of records) {
      if (!r.params.createdAt) continue
      const day = r.params.createdAt.slice(0, 10)
      expect(day >= earliest).toBe(true)
    }
  })

  test('between with only "from," (no to) acts as gte', async ({ request }) => {
    const past = '2000-01-01'
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}]=between:${past},&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Every seeded customer was created after 2000-01-01.
    const records = body.records as Row[]
    for (const r of records) {
      if (!r.params.createdAt) continue
      expect(r.params.createdAt.slice(0, 10) >= past).toBe(true)
    }
    // The unfiltered count should equal the filtered count when the from
    // bound is earlier than every seeded value.
    const all = await request.get(adminApi(`/resources/customers/actions/list?perPage=200`))
    expect(records.length).toBe(((await all.json()).records as unknown[]).length)
  })

  test('between with only ",to" acts as lte', async ({ request }) => {
    const future = '2999-12-31'
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}]=between:,${future}&perPage=200`),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const all = await request.get(adminApi(`/resources/customers/actions/list?perPage=200`))
    // Nothing in the seed is dated past 2999 — so this filter should match
    // every row.
    expect((body.records as unknown[]).length).toBe(
      ((await all.json()).records as unknown[]).length,
    )
  })

  test('gt operator on DateTime', async ({ request }) => {
    const farFuture = '2999-12-31'
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}]=gt:${farFuture}&perPage=200`),
    )
    expect(res.status()).toBe(200)
    expect(((await res.json()).records as unknown[]).length).toBe(0)
  })

  test('lt operator on DateTime', async ({ request }) => {
    const farPast = '1900-01-01'
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}]=lt:${farPast}&perPage=200`),
    )
    expect(res.status()).toBe(200)
    expect(((await res.json()).records as unknown[]).length).toBe(0)
  })

  test('malformed date string is gracefully handled (no 500)', async ({ request }) => {
    // The converter falls back to the raw string when `new Date(value)`
    // yields NaN. Prisma would normally reject this — but the request must
    // at least not crash the adapter. Either a 200 with empty records or a
    // 400/422 explaining the error is acceptable. A 500 is not.
    const res = await request.get(
      adminApi(`/resources/customers/actions/list?filters[${COL}]=gt:not-a-date&perPage=200`),
    )
    expect(res.status(), `unexpected 5xx: ${await res.text().catch(() => '')}`).toBeLessThan(500)
  })
})
