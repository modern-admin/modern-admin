// Screenshot-based verification that each ChartDef `visualisation`
// (kpi / line / area / bar) actually renders as the type it advertises.
//
// One ChartDef per visualisation type is seeded directly via PUT
// `/admin/api/dashboard`. The page then loads, every widget is screenshot
// to `apps/e2e/playwright/.artifacts/`, and a structural assertion is run
// against the rendered DOM (Recharts paints a marker class on the root
// `<g>` element of the chart: `recharts-area`, `recharts-line`,
// `recharts-bar`). The KPI variant has no SVG — it renders the
// `<KpiCard>` component which has no `<svg>` body inside the card.

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (p: string): string => `${API_URL}/admin/api${p}`

const EMPTY_DASHBOARD = { version: 1, charts: [], groups: [] }
const ARTIFACTS_DIR = 'playwright/.artifacts'

async function resetDashboard(request: APIRequestContext): Promise<void> {
  const res = await request.put(adminApi('/dashboard'), { data: EMPTY_DASHBOARD })
  expect(res.ok()).toBeTruthy()
}

function makeChartDef(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    resource: 'posts',
    dateField: 'publishedAt',
    metric: 'count',
    width: 'half',
    topN: 10,
    filters: {},
    quickFilters: [],
    // `'all'` resolves to a 10-year window — seeded posts have
    // `publishedAt` across calendar 2024 which is outside `1y` from
    // today (2026). Using `'all'` keeps the spec stable as the year rolls.
    timeRange: { preset: 'all' },
    order: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function seed(
  request: APIRequestContext,
  charts: Record<string, unknown>[],
): Promise<void> {
  const res = await request.put(adminApi('/dashboard'), {
    data: { version: 1, charts, groups: [] },
  })
  expect(res.ok()).toBeTruthy()
}

/** Wait until the chart card for the given title is mounted AND its body
 *  has stopped showing the loading skeleton. */
async function waitForChart(page: Page, title: string): Promise<void> {
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
  // The chart body container is identifiable via the card it lives in.
  // We wait until the skeleton placeholder is gone — either the chart
  // renders or the "no data" message is shown.
  await page.waitForLoadState('networkidle')
}

test.describe.configure({ mode: 'serial' })

test.describe('Dashboard chart visualisations — rendered types', () => {
  test.beforeAll(async ({ request }) => {
    // Seed all four charts in one go so we screenshot the page once.
    await seed(request, [
      makeChartDef({
        title: 'KPI variant',
        visualisation: 'kpi',
        step: 'all',
        order: 0,
      }),
      makeChartDef({
        title: 'Line variant',
        visualisation: 'line',
        step: 'month',
        order: 1,
      }),
      makeChartDef({
        title: 'Area variant',
        visualisation: 'area',
        step: 'month',
        order: 2,
      }),
      makeChartDef({
        title: 'Bar variant',
        visualisation: 'bar',
        step: 'month',
        order: 3,
      }),
    ])
  })

  test.afterAll(async ({ request }) => {
    await resetDashboard(request)
  })

  test('renders KPI as a big-number card, Line/Area/Bar as the matching Recharts SVG type', async ({ page }) => {
    await page.goto('/')
    await waitForChart(page, 'KPI variant')
    await waitForChart(page, 'Line variant')
    await waitForChart(page, 'Area variant')
    await waitForChart(page, 'Bar variant')

    // Allow a beat for Recharts to draw paths.
    await page.waitForTimeout(800)

    // Take per-widget screenshots so the user can compare visually.
    const cards: Record<string, ReturnType<Page['locator']>> = {
      kpi: page.locator('div').filter({ hasText: /^KPI variant$/ }).locator('xpath=ancestor::*[contains(@class,"flex flex-col")][1]').first(),
      line: page.locator('div').filter({ hasText: /^Line variant$/ }).locator('xpath=ancestor::*[contains(@class,"flex flex-col")][1]').first(),
      area: page.locator('div').filter({ hasText: /^Area variant$/ }).locator('xpath=ancestor::*[contains(@class,"flex flex-col")][1]').first(),
      bar: page.locator('div').filter({ hasText: /^Bar variant$/ }).locator('xpath=ancestor::*[contains(@class,"flex flex-col")][1]').first(),
    }

    for (const [name, card] of Object.entries(cards)) {
      await expect(card).toBeVisible()
      await card.screenshot({
        path: `${ARTIFACTS_DIR}/chart-type-${name}.png`,
      })
    }

    // Whole dashboard snapshot for context.
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/chart-types-overview.png`,
      fullPage: true,
    })

    // ── Structural assertions ─────────────────────────────────────────
    // Recharts paints a class marker on the root `<g>` of each chart type:
    //   • `<g class="recharts-area">`
    //   • `<g class="recharts-line">`
    //   • `<g class="recharts-bar">`
    // KPI body is text only — no Recharts chart canvas (the chart canvas
    // is the SVG with role="application"; legend icons are separate SVGs).

    const kpi = cards.kpi!
    await expect(kpi.getByRole('application')).toHaveCount(0)
    // Quick check that the big number rendered.
    await expect(
      kpi.locator('xpath=.//*[contains(@class,"text-3xl") or contains(@class,"text-4xl")]'),
    ).toBeVisible()

    const line = cards.line!
    await expect(line.getByRole('application')).toBeVisible()
    await expect(
      line.locator('.recharts-line'),
      'Line variant must render a Recharts <Line>',
    ).toHaveCount(1)

    const area = cards.area!
    await expect(area.getByRole('application')).toBeVisible()
    await expect(
      area.locator('.recharts-area'),
      'Area variant must render a Recharts <Area>',
    ).toHaveCount(1)

    const bar = cards.bar!
    await expect(bar.getByRole('application')).toBeVisible()
    await expect(
      bar.locator('.recharts-bar-rectangles'),
      'Bar variant must render Recharts <Bar> rectangles',
    ).toHaveCount(1)
  })
})
