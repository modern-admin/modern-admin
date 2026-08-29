// UI coverage for the dashboard chart builder on `/` (HomePage).
//
// The dashboard is stored GLOBALLY on the server
// (`packages/nest/src/dashboard.controller.ts` keys by `'global'`), so each
// test wipes the blob via the REST endpoint before running. The same hook
// runs in `afterAll` so the suite leaves nothing behind for other specs.
//
// Coverage:
//   • Empty state on a fresh dashboard.
//   • Create a chart through the builder dialog (resource + dateField +
//     metric + visualisation) and reload — the chart must survive (proves
//     the ServerDashboardStore round-trip).
//   • Edit an existing chart through the row "…" dropdown.
//   • Delete a chart through the row "…" dropdown + confirm dialog.
//   • Group lifecycle: create group → existing ungrouped chart joins it
//     (first-group rule), create a second group, switch tabs, delete a
//     group (cascade-removes its charts).
//   • Move a chart between groups through the row "…" dropdown.

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (p: string): string => `${API_URL}/admin/api${p}`

const EMPTY_DASHBOARD = { version: 1, charts: [], groups: [] }

/** Wipe the global dashboard blob so each test starts clean. */
async function resetDashboard(request: APIRequestContext): Promise<void> {
  const res = await request.put(adminApi('/dashboard'), { data: EMPTY_DASHBOARD })
  expect(res.ok(), 'reset dashboard').toBeTruthy()
}

/**
 * Build a minimal valid `ChartDef` payload for direct seeding via PUT
 * `/admin/api/dashboard`. Keeps every test that doesn't exercise the
 * builder UI short — we don't need to click through 6 selects just to
 * land in the "edit / delete / move" flows.
 */
function makeChartDef(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    title: 'Fixture chart',
    resource: 'posts',
    visualisation: 'area',
    dateField: 'publishedAt',
    step: 'day',
    metric: 'count',
    width: 'half',
    topN: 10,
    filters: {},
    quickFilters: [],
    timeRange: { preset: '30d' },
    order: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeGroup(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    name: 'Group',
    order: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function seedDashboard(
  request: APIRequestContext,
  blob: { charts?: Record<string, unknown>[]; groups?: Record<string, unknown>[] },
): Promise<void> {
  const res = await request.put(adminApi('/dashboard'), {
    data: { version: 1, charts: blob.charts ?? [], groups: blob.groups ?? [] },
  })
  expect(res.ok(), 'seed dashboard').toBeTruthy()
}

async function createCustomerWithName(request: APIRequestContext, name: string): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const response = await request.post(adminApi('/resources/customers/actions/new'), {
    data: { email: `chart-filter-${suffix}@example.com`, name, tier: 'free' },
  })
  expect(response.ok(), 'create chart filter customer').toBeTruthy()
  return String((await response.json()).record.id)
}

async function deleteCustomerSilently(request: APIRequestContext, id: string): Promise<void> {
  try {
    await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
  } catch {
    // A timed-out Playwright test may dispose its request context before cleanup.
  }
}

/** Locate a Radix select trigger by its `id` attribute. */
function selectTriggerById(page: Page, id: string) {
  return page.locator(`#${id}`)
}

/**
 * Click `option` by its accessible name inside the currently-open
 * Radix listbox. Radix renders options as `role="option"` portals at
 * the document root, so a global `getByRole` is the simplest match.
 */
async function pickOption(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole('option', { name }).first().click()
}

// Serial: each test mutates the global dashboard blob.
test.describe.configure({ mode: 'serial' })

test.describe('Dashboard chart builder — UI', () => {
  test.beforeEach(async ({ request }) => {
    await resetDashboard(request)
  })

  test.afterAll(async ({ request }) => {
    await resetDashboard(request)
  })

  test('shows the empty state when no charts are configured', async ({ page }) => {
    await page.goto('/')
    // Empty card title is rendered inside the Dashboard card.
    await expect(page.getByText('No charts yet')).toBeVisible({ timeout: 15_000 })
    // Action affordances remain accessible.
    await expect(page.getByRole('button', { name: /^Add chart$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Add group$/ })).toBeVisible()
  })

  test('renders builder tooltips outside the scroll-clipped dialog', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Add chart$/ }).click()
    await page.setViewportSize({ width: 375, height: 812 })

    const dialog = page.getByRole('dialog')
    const orderTooltipTrigger = dialog.locator('button:has(svg.lucide-info)').first()
    await orderTooltipTrigger.hover()

    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toHaveText('Lower numbers come first.')
    expect(await tooltip.evaluate((element) => element.closest('[role="dialog"]'))).toBeNull()

    const bounds = await tooltip.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    )
    expect(
      await tooltip.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const topmost = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return topmost === element || element.contains(topmost)
      }),
    ).toBe(true)
  })

  test('creates a KPI chart through the builder and persists across reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Add chart$/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Pick KPI visualisation.
    await dialog.getByRole('button', { name: 'KPI', exact: true }).click()
    // Title.
    await dialog.locator('#chart-title').fill('E2E KPI Posts')
    // Resource = posts.
    await selectTriggerById(page, 'chart-resource').click()
    await pickOption(page, /^Posts/)
    // Date field = Published At.
    await selectTriggerById(page, 'chart-datefield').click()
    await pickOption(page, 'Published At')

    await dialog.getByRole('button', { name: /^Save chart$/ }).click()
    await expect(dialog).toBeHidden()

    // The chart card lands in the grid.
    await expect(page.getByText('E2E KPI Posts')).toBeVisible({ timeout: 10_000 })

    // Reload — ServerDashboardStore round-trip must keep the chart visible.
    await page.reload()
    await expect(page.getByText('E2E KPI Posts')).toBeVisible({ timeout: 15_000 })
  })

  test('persists operator-based chart filters', async ({ page, request }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Add chart$/ }).click()
    const dialog = page.getByRole('dialog')

    await dialog.locator('#chart-title').fill('Filtered posts')
    await selectTriggerById(page, 'chart-resource').click()
    await pickOption(page, /^Posts/)
    await selectTriggerById(page, 'chart-datefield').click()
    await pickOption(page, 'Published At')
    await dialog.getByRole('tab', { name: 'Filters' }).click()

    await selectTriggerById(page, 'flt-publishedAt').click()
    await pickOption(page, 'Is empty')
    await selectTriggerById(page, 'flt-title').click()
    await pickOption(page, 'Is not empty')

    await dialog.getByRole('button', { name: /^Save chart$/ }).click()
    await expect(dialog).toBeHidden()

    const response = await request.get(adminApi('/dashboard'))
    expect(response.status()).toBe(200)
    const body = (await response.json()) as {
      dashboard: { charts: Array<{ title: string; filters: Record<string, string> }> }
    }
    const chart = body.dashboard.charts.find((item) => item.title === 'Filtered posts')
    expect(chart?.filters).toMatchObject({ publishedAt: 'empty:', title: 'nempty:' })
  })

  test('preserves commas inside chart filter selections', async ({ page, request }) => {
    const name = `Smith, John ${Date.now()}`
    const customerId = await createCustomerWithName(request, name)

    try {
      await page.goto('/')
      await page.getByRole('button', { name: /^Add chart$/ }).click()
      const dialog = page.getByRole('dialog')

      await dialog.locator('#chart-title').fill('Comma-safe filter')
      await selectTriggerById(page, 'chart-resource').click()
      await pickOption(page, /^Customers/)
      await selectTriggerById(page, 'chart-datefield').click()
      await pickOption(page, 'Member since')
      await dialog.getByRole('tab', { name: 'Filters' }).click()

      await selectTriggerById(page, 'flt-name').click()
      await pickOption(page, 'Is one of')
      await dialog.getByRole('checkbox', { name }).click()

      await dialog.getByRole('button', { name: /^Save chart$/ }).click()
      await expect(dialog).toBeHidden()

      const response = await request.get(adminApi('/dashboard'))
      expect(response.status()).toBe(200)
      const body = (await response.json()) as {
        dashboard: { charts: Array<{ title: string; filters: Record<string, string> }> }
      }
      const chart = body.dashboard.charts.find((item) => item.title === 'Comma-safe filter')
      expect(chart?.filters.name).toBe(`in:json:${JSON.stringify([name])}`)
    } finally {
      await deleteCustomerSilently(request, customerId)
    }
  })

  test('Save is disabled when the date field is cleared', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Add chart$/ }).click()
    const dialog = page.getByRole('dialog')
    const save = dialog.getByRole('button', { name: /^Save chart$/ })

    // Pick "posts" so we know the date-field selector lists `Published At`.
    await selectTriggerById(page, 'chart-resource').click()
    await pickOption(page, /^Posts/)
    // Auto-fill from `dateProps[0]?.path` leaves the date field populated;
    // Save is enabled.
    await expect(save).toBeEnabled()

    // Clear the date field via the placeholder option.
    await selectTriggerById(page, 'chart-datefield').click()
    await pickOption(page, 'Select field…')
    await expect(save).toBeDisabled()
  })

  test('edits a chart title through the row dropdown menu', async ({ page, request }) => {
    await seedDashboard(request, {
      charts: [makeChartDef({ title: 'Original Title' })],
    })

    await page.goto('/')
    await expect(page.getByText('Original Title')).toBeVisible({ timeout: 15_000 })

    // Open the row "…" menu and click "Edit chart".
    await page.getByRole('button', { name: 'Open menu' }).first().click()
    await page.getByRole('menuitem', { name: /Edit chart/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Builder is pre-populated.
    const titleInput = dialog.locator('#chart-title')
    await expect(titleInput).toHaveValue('Original Title')

    await titleInput.fill('Renamed Title')
    await dialog.getByRole('button', { name: /^Save chart$/ }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText('Renamed Title')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Original Title')).toHaveCount(0)
  })

  test('deletes a chart through the row dropdown with confirmation', async ({ page, request }) => {
    await seedDashboard(request, {
      charts: [makeChartDef({ title: 'Doomed Chart' })],
    })

    await page.goto('/')
    await expect(page.getByText('Doomed Chart')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Open menu' }).first().click()
    await page.getByRole('menuitem', { name: /Remove chart/i }).click()

    // Confirmation dialog is an alertdialog. Scope the "Delete" button to it.
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: /^Delete$/ }).click()
    await expect(confirm).toBeHidden()

    await expect(page.getByText('Doomed Chart')).toHaveCount(0)
    await expect(page.getByText('No charts yet')).toBeVisible()
  })

  test('group lifecycle: create, switch tabs, delete with cascade', async ({ page, request }) => {
    // Seed one ungrouped chart — the first-group rule will adopt it.
    await seedDashboard(request, {
      charts: [makeChartDef({ title: 'Roaming Chart' })],
    })

    await page.goto('/')
    await expect(page.getByText('Roaming Chart')).toBeVisible({ timeout: 15_000 })

    // Add a first group "Sales" → tab strip appears, chart joins it.
    await page.getByRole('button', { name: /^Add group$/ }).click()
    const groupDialog = page.getByRole('dialog')
    await groupDialog.locator('#group-name').fill('Sales')
    await groupDialog.getByRole('button', { name: /^Save group$/ }).click()
    await expect(groupDialog).toBeHidden()

    const tablist = page.getByRole('tablist')
    await expect(tablist.getByRole('tab', { name: 'Sales' })).toBeVisible()
    await expect(page.getByText('Roaming Chart')).toBeVisible()

    // Add a second group "Ops".
    await page.getByRole('button', { name: /^Add group$/ }).click()
    const groupDialog2 = page.getByRole('dialog')
    await groupDialog2.locator('#group-name').fill('Ops')
    await groupDialog2.getByRole('button', { name: /^Save group$/ }).click()
    await expect(groupDialog2).toBeHidden()
    await expect(tablist.getByRole('tab', { name: 'Ops' })).toBeVisible()

    // Switching to "Ops" — Roaming Chart belongs to Sales, not Ops.
    await tablist.getByRole('tab', { name: 'Ops' }).click()
    await expect(page.getByText('Roaming Chart')).toHaveCount(0)
    await expect(page.getByText('No charts yet')).toBeVisible()

    // Delete the (empty) Ops group — confirm cascade dialog appears.
    await page.getByRole('button', { name: 'Remove group', exact: true }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: /^Delete$/ }).click()
    await expect(confirm).toBeHidden()

    // Ops tab gone, Sales remains, Roaming Chart visible again.
    await expect(tablist.getByRole('tab', { name: 'Ops' })).toHaveCount(0)
    await expect(tablist.getByRole('tab', { name: 'Sales' })).toBeVisible()
    await expect(page.getByText('Roaming Chart')).toBeVisible()
  })

  test('moves a chart between groups through the row dropdown', async ({ page, request }) => {
    const alpha = crypto.randomUUID()
    const beta = crypto.randomUUID()
    await seedDashboard(request, {
      charts: [makeChartDef({ title: 'Movable Chart', groupId: alpha })],
      groups: [
        makeGroup({ id: alpha, name: 'Alpha', order: 0 }),
        makeGroup({ id: beta, name: 'Beta', order: 1 }),
      ],
    })

    await page.goto('/')
    const tablist = page.getByRole('tablist')
    await expect(tablist.getByRole('tab', { name: 'Alpha' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Movable Chart')).toBeVisible()

    // Open the row menu → Move.
    await page.getByRole('button', { name: 'Open menu' }).first().click()
    await page.getByRole('menuitem', { name: /Move to group/i }).click()

    const moveDialog = page.getByRole('dialog')
    await expect(moveDialog).toBeVisible()
    // Switch the target group to Beta.
    await selectTriggerById(page, 'move-group').click()
    await pickOption(page, 'Beta')
    await moveDialog.getByRole('button', { name: /^Move to group$/ }).click()
    await expect(moveDialog).toBeHidden()

    // Chart no longer in Alpha tab.
    await expect(page.getByText('Movable Chart')).toHaveCount(0)
    // Beta tab shows it.
    await tablist.getByRole('tab', { name: 'Beta' }).click()
    await expect(page.getByText('Movable Chart')).toBeVisible()
  })
})
