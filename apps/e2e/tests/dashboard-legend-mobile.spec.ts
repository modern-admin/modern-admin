// Guards the mobile layout of a many-series time-series chart.
//
// Recharts' own `<Legend>` is laid out *inside* the chart box, so every
// wrapped legend row is subtracted from the plot area: with a `groupBy`
// breakdown (12 series + "Other") on a phone-width card the legend used to
// take the whole tile and the chart collapsed to a few pixels. The legend is
// now plain DOM below the plot, so the plot keeps its full height no matter
// how many series there are.
//
// A single chart is seeded via PUT `/admin/api/dashboard` and the dashboard
// is reset afterwards.

import { expect, test, type APIRequestContext } from '@playwright/test'
import { uuidv7 } from '@modern-admin/core'

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (p: string): string => `${API_URL}/admin/api${p}`

// Narrow widths cap the plot at 230px (see `TimeSeriesChart`); anything much
// smaller means the legend is eating the chart again.
const NARROW_PLOT_HEIGHT = 230

async function putDashboard(
  request: APIRequestContext,
  charts: Record<string, unknown>[],
): Promise<void> {
  const res = await request.put(adminApi('/dashboard'), {
    data: { version: 1, charts, groups: [] },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe.configure({ mode: 'serial' })

test.describe('Dashboard chart legend — many series on a narrow viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeAll(async ({ request }) => {
    await putDashboard(request, [
      {
        id: uuidv7(),
        title: 'Posts by author',
        resource: 'posts',
        dateField: 'publishedAt',
        metric: 'count',
        groupBy: 'authorId',
        visualisation: 'line',
        step: 'month',
        width: 'full',
        topN: 12,
        filters: {},
        quickFilters: [],
        // `'all'` resolves to a 10-year window — seeded posts sit in 2024,
        // outside `1y` from today, so the spec stays stable as the year rolls.
        timeRange: { preset: 'all' },
        order: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ])
  })

  test.afterAll(async ({ request }) => {
    await putDashboard(request, [])
  })

  test('keeps the plot at full height and toggles a series from the legend', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Posts by author')).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    const lines = page.locator('.recharts-line')
    // topN: 12 + the "Other" bucket — enough series that the old in-chart
    // legend wrapped into ~13 rows at 375px.
    await expect(lines).toHaveCount(13)

    const plot = page.locator('.recharts-surface').first()
    const box = await plot.boundingBox()
    expect(box?.height ?? 0).toBeCloseTo(NARROW_PLOT_HEIGHT, -1)

    // Legend item is a real button: clicking hides that series' <Line>.
    const item = page.getByRole('button', { name: /example\.com/ }).first()
    await expect(item).toHaveAttribute('aria-pressed', 'true')
    await item.click()
    await expect(lines).toHaveCount(12)
    await item.click()
    await expect(lines).toHaveCount(13)
  })
})
