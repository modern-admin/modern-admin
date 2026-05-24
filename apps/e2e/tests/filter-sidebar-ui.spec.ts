import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * UI regression for the FilterPanel side-sheet
 * (`packages/react/src/pages/list-page.tsx:FilterPanel`).
 *
 * Why this spec exists: the in-memory adapter's catch-all filter branch
 * used to apply a case-insensitive substring match for *every* string
 * needle — including FK / id / numeric columns — which leaked unrelated
 * rows whenever a header- or sidebar-filter set a bare value. The
 * regression slipped through because no UI spec actually opened the
 * Filters sheet, applied a value, and checked that the visible rows
 * matched the filter. This file pins that contract from the UI down to
 * the API.
 *
 * Coverage:
 *   • Reference filter (posts.authorId via the customer combobox):
 *     verifies strict equality — picking customer "1" must NOT pull in
 *     authorId 10, 11, …, 21.
 *   • Enum filter (customers.tier = "pro"): verifies that an enum
 *     `availableValues` field renders as a plain Select and that
 *     applying it filters the list exactly. Also asserts the badge on
 *     the Filters trigger updates to "1".
 *   • Clear-all: dropping all filters from the sheet restores the
 *     unfiltered list and removes the `filters[...]` param from the
 *     URL.
 *
 * Note: the StringFilterField for free-text columns auto-switches to
 * the `in` operator when the field is low-cardinality (or the distinct
 * endpoint returns nothing), which renders a checkbox picker instead
 * of a plain text input. Driving that flow from the UI requires an
 * operator-switch step that's tangential to the regression here — the
 * substring semantic is already pinned at the adapter level by the
 * API curl checks in `related-records-ui.spec.ts`.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

/** The Filters trigger in the list toolbar (icon + "Filters" label on ≥ sm).
 *  The accessible name picks up the active-filter badge too — once a
 *  filter is applied the button name becomes `"Filters 1"`, so the
 *  regex anchors only on the leading word, not the end. */
function filtersTrigger(page: Page) {
  return page.getByRole('button', { name: /^Filters\b/i }).first()
}

/**
 * Read a `filters[<key>]` URL param the router emits. The router may
 * keep brackets raw (when the URL was typed/pasted) or percent-encode
 * them (when constructed via `URLSearchParams`); both forms decode
 * identically through `URL.searchParams.get`, which is why we drive
 * URL assertions through this helper instead of brittle string regex.
 */
function filterParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(`filters[${key}]`)
}

/** The filter sheet (Radix Sheet → role="dialog"). */
function filterSheet(page: Page) {
  return page.getByRole('dialog')
}

/**
 * Locate the per-field section inside the sheet by its visible label
 * text. Each `FilterField` is a
 * `<div class="space-y-1.5"><Label>{label}</Label>…</div>` — we walk up
 * from the matching `<label>` to that wrapper.
 *
 * Note: property labels come from `property.label` (the runtime
 * humanized form of the path or an explicit override). For posts:
 * "Post title" (not "Title"), "Author" (override of "Author id").
 */
function filterField(page: Page, labelText: string) {
  return filterSheet(page).locator(
    `xpath=.//label[normalize-space()="${labelText}"]/parent::div`,
  )
}

async function openList(page: Page, resource: string): Promise<void> {
  await page.goto(`/resources/${resource}?perPage=50`)
  // Wait for the first row of seeded data so the toolbar (and the
  // Filters button) has mounted before any interactions.
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

test.describe('FilterPanel — UI sidebar interactions', () => {
  test('reference filter (Author) returns only that customer\'s posts', async ({
    page,
    request,
  }) => {
    // Pick a customer id whose digit overlaps another id — that's the
    // exact case where the substring-match regression surfaced
    // (customer "1" vs "10", "11", …, "21"). Customer #1 always exists
    // in the seed.
    const authorId = '1'

    // Strict-API count → expected visible row count after the UI
    // applies the filter. If the substring bug regresses, the table
    // will show many more rows than this.
    const apiBody = await (
      await request.get(
        adminApi(`/resources/posts/actions/list?perPage=200&filters[authorId]=${authorId}`),
      )
    ).json()
    const expectedCount = apiBody.records.length as number
    const expectedAuthors = Array.from(
      new Set(
        (apiBody.records as Array<{ params: { authorId: string } }>).map(
          (r) => r.params.authorId,
        ),
      ),
    )
    expect(expectedAuthors).toEqual([authorId])

    await openList(page, 'posts')
    await openFilters(page)

    // The Author field renders a ReferenceCombobox — a button with
    // role="combobox" inside the sheet. The select-by-typing dance
    // happens in a portal'd Popover that escapes the sheet, so the
    // trigger is scoped to the sheet but the dropdown items live at
    // the page root.
    await filterField(page, 'Author').getByRole('combobox').click()
    await page.getByPlaceholder(/^Search\b/i).last().fill(authorId)
    await page.getByRole('option').first().click()

    await applyFilters(page)

    await expect.poll(() => filterParam(page, 'authorId'), { timeout: 5_000 })
      .toBe(authorId)

    const pageSize = Math.min(50, expectedCount)
    await expect(page.locator('tbody tr')).toHaveCount(pageSize, { timeout: 10_000 })
  })

  test('enum filter (Tier = pro) returns only matching customers and updates the badge', async ({
    page,
    request,
  }) => {
    const apiBody = await (
      await request.get(
        adminApi('/resources/customers/actions/list?perPage=200&filters[tier]=pro'),
      )
    ).json()
    const expectedCount = apiBody.records.length as number
    expect(expectedCount, 'seed must include customers on the pro tier')
      .toBeGreaterThan(0)
    const distinctTiers = Array.from(
      new Set(
        (apiBody.records as Array<{ params: { tier: string } }>).map(
          (r) => r.params.tier,
        ),
      ),
    )
    expect(distinctTiers).toEqual(['pro'])

    await openList(page, 'customers')
    await openFilters(page)

    // Tier has `availableValues` → FilterInput renders a plain Radix
    // Select (no auto-switch to the `in` checkbox picker that strings
    // get). Open it and pick "pro" — the SelectContent renders in a
    // portal at the page root, hence the page-scoped option lookup.
    await filterField(page, 'Tier').getByRole('combobox').click()
    await page.getByRole('option', { name: /^pro$/i }).click()

    await applyFilters(page)

    await expect.poll(() => filterParam(page, 'tier'), { timeout: 5_000 })
      .toBe('pro')

    // Filtered row count matches the strict API count.
    const pageSize = Math.min(50, expectedCount)
    await expect(page.locator('tbody tr')).toHaveCount(pageSize, { timeout: 10_000 })

    // The trigger button hosts a small badge with the active-filter
    // count ("1" once we've applied one filter).
    await expect(filtersTrigger(page).getByText(/^1$/)).toBeVisible({
      timeout: 5_000,
    })
  })

  test('Clear-all drops the filter from URL and restores the full list', async ({
    page,
  }) => {
    // Land directly on a filtered URL — quicker than driving the sheet
    // twice for setup + teardown.
    await page.goto('/resources/customers?perPage=50&filters[tier]=pro')
    await expect.poll(() => filterParam(page, 'tier')).toBe('pro')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    const filteredCount = await page.locator('tbody tr').count()
    expect(filteredCount).toBeGreaterThan(0)

    // Open the sheet and hit Clear all — the header button is only
    // rendered when `draft.length > 0`, which it is now.
    await openFilters(page)
    await filterSheet(page).getByRole('button', { name: /^Clear all$/i }).click()

    // Clear-all commits immediately (no Apply needed) — the URL drops
    // the filter param and the list reloads unfiltered.
    await expect.poll(() => filterParam(page, 'tier'), { timeout: 5_000 })
      .toBeNull()

    // Close the sheet (Escape) and verify the row count grew back
    // beyond the filtered subset.
    await page.keyboard.press('Escape')
    await expect(filterSheet(page)).toBeHidden({ timeout: 5_000 })

    await expect
      .poll(async () => page.locator('tbody tr').count(), { timeout: 10_000 })
      .toBeGreaterThan(filteredCount)
  })
})
