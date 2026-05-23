// /admin/api/timeseries — verifies that when a chart groups by a FK
// column (`posts.categoryId`) and the request carries
// `groupByLabelResource: 'categories'`, the response includes
// `resolvedLabels` mapping each FK id to the referenced record's title.
//
// The Categories resource declares `titleProperty: 'displayName'`
// (apps/_shared/src/admin/categories/categories.controller.ts). The path
// `displayName` is deliberately OUTSIDE the auto-detection list
// `TITLE_COLUMN_NAMES = ['title', 'name', 'subject', 'email']` defined in
// packages/core/src/adapters/base-property.ts — so a passing test proves
// the explicit `titleProperty` override is honoured rather than the
// heuristic falling back to the `name` column. This matches the user's
// real case: their "Apps" resource declares `titleProperty: 'displayName'`
// and the chart legend previously showed raw FK ids.
//
// Data: 200 seeded `posts` × 12 seeded `categories`, both with random
// `publishedAt` across calendar 2024 (apps/api/src/demo/seed.ts). Each
// category row has `displayName = "<name> (section)"` so the test can
// distinguish `displayName` from `name` value-wise.

import { expect, test, type APIRequestContext } from '@playwright/test'

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

// Special bucket keys the analytics layer reserves; they MUST NOT be sent
// to the label resolver (the controller filters them out).
const SPECIAL_BUCKETS = new Set(['__total__', '__other__', '__null__'])

interface SeriesPoint { ts: string; value: number }
interface Series { key: string; points: SeriesPoint[] }
interface TimeSeriesResponse {
  series: Series[]
  resolvedLabels?: Record<string, string>
  supported: boolean
}

interface CategoryRow {
  id: string
  title: string
  params: { name?: string; displayName?: string }
}

/**
 * Fetch every category with its server-computed `title` plus the raw
 * `name` / `displayName` params so the test can assert that
 * `title === displayName` AND `title !== name` (proving the explicit
 * `titleProperty: 'displayName'` won over the auto-detection that
 * would otherwise have selected `name`).
 */
async function fetchCategoryRows(request: APIRequestContext): Promise<CategoryRow[]> {
  const res = await request.get(adminApi('/resources/categories/actions/list?perPage=100'))
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return body.records as CategoryRow[]
}

test.describe('Time-series / chart breakdown — titleProperty label resolution', () => {
  test('groupBy FK + groupByLabelResource resolves ids to displayName (titleProperty override wins over name auto-detect)', async ({
    request,
  }) => {
    // Verify the resource really surfaces `displayName` as its title — and
    // that `displayName !== name` so the assertions below can distinguish
    // the two paths.
    const categories = await fetchCategoryRows(request)
    expect(categories.length).toBeGreaterThan(0)
    const titleById = new Map<string, string>()
    const nameById = new Map<string, string>()
    const displayNameById = new Map<string, string>()
    for (const c of categories) {
      titleById.set(String(c.id), c.title)
      nameById.set(String(c.id), String(c.params.name))
      displayNameById.set(String(c.id), String(c.params.displayName))
      // Anchor invariants the user's bug hinges on:
      //   • title comes from the explicit titleProperty,
      //   • that path is NOT auto-detected by isTitle() — proven by the
      //     fact title equals displayName, not name.
      expect(c.params.displayName).toBeTruthy()
      expect(c.title, `category ${c.id}: title must equal displayName`).toBe(c.params.displayName)
      expect(c.title, `category ${c.id}: title must NOT equal name (auto-detect fallback)`).not.toBe(c.params.name)
    }

    // Ask the analytics endpoint to bucket posts by month, broken down by
    // their `categoryId` FK. The demo seeds publishedAt across calendar
    // 2024; widen the window slightly to absorb any timezone drift.
    const res = await request.post(adminApi('/timeseries'), {
      data: {
        resource: 'posts',
        dateField: 'publishedAt',
        step: 'month',
        metric: 'count',
        groupBy: 'categoryId',
        groupByLabelResource: 'categories',
        topN: 20,
        from: '2023-12-01T00:00:00.000Z',
        to: '2025-02-01T00:00:00.000Z',
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    const body = (await res.json()) as TimeSeriesResponse
    expect(body.supported).toBe(true)
    expect(body.series.length).toBeGreaterThan(0)

    // The reported resolvedLabels map must be present and non-empty.
    expect(body.resolvedLabels).toBeDefined()
    const labels = body.resolvedLabels!
    expect(Object.keys(labels).length).toBeGreaterThan(0)

    // Every non-special series key must:
    //   1. carry a resolved label,
    //   2. resolve to the displayName, NOT to the id and NOT to name,
    //   3. match the corresponding title from the categories list (which
    //      itself is sourced from displayName).
    const seenIds = new Set<string>()
    for (const s of body.series) {
      if (SPECIAL_BUCKETS.has(s.key)) continue
      seenIds.add(s.key)
      const label = labels[s.key]
      expect(label, `series ${s.key} should be resolved`).toBeDefined()
      expect(label, `series ${s.key} label must differ from id`).not.toBe(s.key)
      const expectedTitle = titleById.get(s.key)
      const expectedDisplay = displayNameById.get(s.key)
      const expectedName = nameById.get(s.key)
      expect(expectedTitle, `series ${s.key} must map to a known category`).toBeDefined()
      expect(label).toBe(expectedTitle!)
      expect(label).toBe(expectedDisplay!)
      // The key assertion this test was rewritten for: the chart must
      // NOT surface the auto-detected `name` value — proving the
      // `titleProperty: 'displayName'` override actually drove resolution.
      expect(label, `series ${s.key} must NOT be the auto-detected name`).not.toBe(expectedName!)
    }

    // We expect at least one real category id to appear in the series.
    expect(seenIds.size).toBeGreaterThanOrEqual(1)
  })

  test('without groupByLabelResource the response has no resolvedLabels', async ({
    request,
  }) => {
    // Drop `groupByLabelResource` from the payload — the controller MUST
    // NOT fabricate label resolution out of nowhere, so the resp must
    // omit `resolvedLabels` entirely.
    const res = await request.post(adminApi('/timeseries'), {
      data: {
        resource: 'posts',
        dateField: 'publishedAt',
        step: 'month',
        metric: 'count',
        groupBy: 'categoryId',
        topN: 20,
        from: '2023-12-01T00:00:00.000Z',
        to: '2025-02-01T00:00:00.000Z',
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    const body = (await res.json()) as TimeSeriesResponse
    expect(body.supported).toBe(true)
    expect(body.series.length).toBeGreaterThan(0)
    expect(body.resolvedLabels).toBeUndefined()
    // Series keys remain raw category ids — that's the regression the
    // resolvedLabels feature shipped to fix.
    const nonSpecial = body.series.map((s) => s.key).filter((k) => !SPECIAL_BUCKETS.has(k))
    expect(nonSpecial.length).toBeGreaterThan(0)
  })

  test('unknown groupByLabelResource degrades to raw keys (no 5xx)', async ({
    request,
  }) => {
    // Robustness: an outdated chart def referencing a deleted resource
    // must not blow up the endpoint — the controller catches and skips
    // label resolution silently.
    const res = await request.post(adminApi('/timeseries'), {
      data: {
        resource: 'posts',
        dateField: 'publishedAt',
        step: 'month',
        metric: 'count',
        groupBy: 'categoryId',
        groupByLabelResource: 'no-such-resource',
        topN: 20,
        from: '2023-12-01T00:00:00.000Z',
        to: '2025-02-01T00:00:00.000Z',
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(500)
    if (res.ok()) {
      const body = (await res.json()) as TimeSeriesResponse
      expect(body.resolvedLabels).toBeUndefined()
    }
  })
})
