import { expect, test, type Page } from '@playwright/test'

/**
 * Regression coverage for the "Is one of" (`in`) filter.
 *
 * Reproduces two bugs in the original implementation:
 *
 *   1. **Adapter inconsistency for empty `in`.** The Prisma adapter
 *      historically interpreted `filters[col]=in:` as `{ in: [] }` and
 *      returned zero rows, while Drizzle treats it as "no filter" and
 *      returns all rows. The "Is one of" picker emits an empty `in:`
 *      when the user unchecks the last item, so the UI experience
 *      differed by ORM until this regression was fixed.
 *
 *   2. **Phantom URL param after unchecking all values.** The UI's
 *      `encodeFilter('in', '')` previously returned `'in:'` to preserve
 *      the operator across reopens. That value survives `setDraftFilter`'s
 *      empty-string guard (`'in:' !== ''`) and ends up in the URL,
 *      showing a "1 active filter" badge with no real filtering happening.
 *
 * Fixes:
 *   • `packages/adapter-prisma/src/converters.ts`: empty `in: []` → drop
 *     the field-level clause (`return undefined`), matching Drizzle.
 *   • `packages/react/src/pages/list-page.tsx`: `encodeFilter('in', '')`
 *     returns `''` so the draft cleans up to "no filter".
 *
 * Resource pick for the auto-switch tests: `tags.color` — a plain
 * auto-detected string property with 6 distinct seed values, under the
 * `ONE_OF_DEFAULT_MAX` (10) cap that gates the auto-switch to the
 * checkbox picker. `categories.name` (12 distinct values) sits ABOVE the
 * cap and pins the opposite default ("Contains" + manual switch still
 * works). Other obvious candidates are unsuitable:
 *   • `customers.tier` has `availableValues: [...TIERS]` in the seed
 *     schema, so the UI routes it to the enum `<Select>` (showing
 *     "Any" placeholder) — no `in` operator at all.
 *   • `admins.role` is overridden to `{type: 'reference'}` in the
 *     shared admin module → renders as a reference picker.
 *
 * API tests still target `customers.tier`: the bug surface is the URL
 * encoding `filters[col]=in:...` at the adapter layer, which is
 * UI-agnostic. Tier has 3 known values and short categorical names,
 * which makes the API assertions readable.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

/** Filters trigger in the toolbar (icon + "Filters" label). */
function filtersTrigger(page: Page) {
  return page.getByRole('button', { name: /^Filters\b/i }).first()
}

function filterSheet(page: Page) {
  return page.getByRole('dialog')
}

/**
 * The per-field section inside the sheet. Walks up from the matching
 * `<label>` to the wrapper produced by `FilterField`. Property labels
 * come from `property.label`, optionally overridden by an i18n locale
 * file. For `categories.name` the demo locale at
 * `apps/web/src/locales/en.json` renames the field to "Internal name".
 */
function filterField(page: Page, labelText: string) {
  return filterSheet(page).locator(
    `xpath=.//label[normalize-space()="${labelText}"]/parent::div`,
  )
}

/** Read a `filters[<key>]` URL param. */
function filterParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(`filters[${key}]`)
}

async function openCategoriesList(page: Page): Promise<void> {
  await page.goto('/resources/categories?perPage=50')
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
}

async function openTagsList(page: Page): Promise<void> {
  await page.goto('/resources/tags?perPage=50')
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
}

async function openFilters(page: Page): Promise<void> {
  await filtersTrigger(page).click()
  await expect(filterSheet(page)).toBeVisible({ timeout: 5_000 })
}

async function applyFilters(page: Page): Promise<void> {
  await filterSheet(page).getByRole('button', { name: /^Apply filters$/i }).click()
  await expect(filterSheet(page)).toBeHidden({ timeout: 5_000 })
}

test.describe('Filter — "Is one of" (in) operator: API', () => {
  test('in:val1,val2 returns only matching rows', async ({ request }) => {
    const res = await request.get(
      adminApi('/resources/customers/actions/list?filters[tier]=in:pro,enterprise&perPage=200'),
    )
    expect(res.status(), await res.text().catch(() => '')).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { tier: string | null } }>
    expect(records.length).toBeGreaterThan(0)
    for (const r of records) {
      expect(['pro', 'enterprise']).toContain(r.params.tier)
    }
  })

  test('in:single returns only that value', async ({ request }) => {
    const res = await request.get(
      adminApi('/resources/customers/actions/list?filters[tier]=in:free&perPage=200'),
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const records = body.records as Array<{ params: { tier: string | null } }>
    for (const r of records) {
      expect(r.params.tier).toBe('free')
    }
  })

  test('empty `in:` is treated as no filter (consistent across adapters)', async ({
    request,
  }) => {
    // Baseline: total rows in the resource.
    const all = await request.get(adminApi('/resources/customers/actions/list?perPage=200'))
    expect(all.status()).toBe(200)
    const allBody = await all.json()
    const totalCount = (allBody.records as unknown[]).length
    expect(totalCount).toBeGreaterThan(0)

    // Empty `in:` (no items selected) — historical bug: Prisma + in-memory
    // returned `{ in: [] }` → 0 rows; Drizzle returned `null` → all rows.
    // The fix aligns all adapters on the Drizzle behaviour.
    const empty = await request.get(
      adminApi('/resources/customers/actions/list?filters[tier]=in:&perPage=200'),
    )
    expect(empty.status()).toBe(200)
    const emptyBody = await empty.json()
    expect((emptyBody.records as unknown[]).length).toBe(totalCount)
  })
})

test.describe('Filter — "Is one of" (in) operator: UI', () => {
  test('auto-switches to checkbox picker on low-cardinality string field', async ({
    page,
  }) => {
    await openTagsList(page)
    await openFilters(page)

    // `tags.color` has 6 distinct seed values — under the
    // ONE_OF_DEFAULT_MAX (10) cap, so the field defaults to "Is one of".
    const colorField = filterField(page, 'Color')

    // Auto-switch only fires after the distinct-values request resolves.
    // The Select trigger shows the localised operator label — for `in` it's
    // "Is one of" in English. Anchor on the (English) label since the
    // e2e fixture user runs in `en` by default.
    await expect(colorField.getByRole('combobox')).toContainText(/Is one of/i, {
      timeout: 10_000,
    })

    // The checkbox picker exposes one `role="checkbox"` row per distinct value. The
    // distinct endpoint returns names sorted alphabetically. Pick a few
    // known seed values to confirm the picker has hydrated.
    await expect(colorField.getByRole('checkbox', { name: 'amber' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(colorField.getByRole('checkbox', { name: 'blue' })).toBeVisible()
    await expect(colorField.getByRole('checkbox', { name: 'green' })).toBeVisible()
  })

  test('field above the one-of cap defaults to Contains; manual switch shows the picker', async ({
    page,
  }) => {
    await openCategoriesList(page)
    await openFilters(page)

    // `categories.name` has 12 distinct seed values — above the cap, so
    // the default stays free-text "Contains" (no unwieldy checkbox wall).
    const nameField = filterField(page, 'Internal name')
    await expect(nameField.getByRole('combobox')).toContainText(/Contains/i, {
      timeout: 10_000,
    })

    // Manually picking "Is one of" still brings up the checkbox picker
    // with the distinct values.
    await nameField.getByRole('combobox').click()
    await page.getByRole('option', { name: /^Is one of$/i }).click()
    await expect(nameField.getByRole('checkbox', { name: 'Design' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(nameField.getByRole('checkbox', { name: 'DevOps' })).toBeVisible()
  })

  test('selecting two values filters the list to that subset', async ({
    page,
    request,
  }) => {
    // Strict-API expectation for the row count after the filter applies.
    const apiBody = await (
      await request.get(
        adminApi('/resources/tags/actions/list?filters[color]=in:blue,green&perPage=200'),
      )
    ).json()
    const expectedCount = (apiBody.records as unknown[]).length
    expect(expectedCount).toBeGreaterThan(0)

    await openTagsList(page)
    await openFilters(page)

    const colorField = filterField(page, 'Color')
    // Wait for the auto-switch + distinct values to render.
    await expect(colorField.getByRole('checkbox', { name: 'blue' })).toBeVisible({
      timeout: 10_000,
    })

    await colorField.getByRole('checkbox', { name: 'blue' }).click()
    await colorField.getByRole('checkbox', { name: 'green' }).click()

    await applyFilters(page)

    // URL carries `in:` prefix + the two selected values. Order matches
    // the click sequence (FilterValuePicker pushes onto `selected`).
    await expect.poll(() => filterParam(page, 'color'), { timeout: 5_000 })
      .toBe('in:blue,green')

    const pageSize = Math.min(50, expectedCount)
    await expect(page.locator('tbody tr')).toHaveCount(pageSize, { timeout: 10_000 })
  })

  test('unchecking the last value clears the filter (no phantom in: in URL)', async ({
    page,
  }) => {
    // Land directly on a single-value `in` filter so the UI hydrates the
    // picker in "in" mode with one item selected.
    await page.goto('/resources/categories?perPage=50&filters[name]=in:Design')
    await expect.poll(() => filterParam(page, 'name')).toBe('in:Design')
    // Category names are unique in the seed, so `in:Design` matches exactly
    // one row. Use the auto-retrying assertion (not an instant `.count()`)
    // so a transient pre-filter render can't be captured as the baseline.
    const filteredCount = 1
    await expect(page.locator('tbody tr')).toHaveCount(filteredCount, { timeout: 15_000 })

    await openFilters(page)

    const nameField = filterField(page, 'Internal name')
    // The toggle checkbox is the same one used to select — clicking it again
    // deselects. Wait for it to be visible (distinct endpoint resolved).
    await expect(nameField.getByRole('checkbox', { name: 'Design' })).toBeVisible({
      timeout: 10_000,
    })
    await nameField.getByRole('checkbox', { name: 'Design' }).click()

    await applyFilters(page)

    // After the fix, `encodeFilter('in', '')` returns '' → the filter is
    // dropped from the draft and the URL. Pre-fix the URL would still
    // carry `filters[name]=in:`.
    await expect.poll(() => filterParam(page, 'name'), { timeout: 5_000 })
      .toBeNull()

    // Row count grows beyond the filtered subset (full list restored).
    await expect
      .poll(async () => page.locator('tbody tr').count(), { timeout: 10_000 })
      .toBeGreaterThan(filteredCount)

    // No active-filter badge on the toolbar.
    await expect(filtersTrigger(page).getByText(/^\d+$/)).toHaveCount(0)
  })
})
