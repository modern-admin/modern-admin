import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Advanced list-page interactions not covered by list-crud.spec.ts:
 *   • Sorting — clicking a column header sets sortBy/direction in the URL and
 *     cycling the click toggles asc → desc → clear.
 *   • Per-page selector — changing the row-count select reflects in URL and
 *     changes the number of visible rows.
 *   • Column visibility — toggling a column off in the Columns menu removes it
 *     from the table header.
 *   • Bulk delete — selecting rows with checkboxes and confirming the bulk
 *     delete removes them from the list and the API.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

async function createCustomer(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string; email: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `Adv Test ${suffix}`
  const email = `adv-${suffix}@example.com`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: { email, name, tier: 'free', ...overrides },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name, email }
}

async function deleteCustomerSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

/** Navigate to the customers list and wait for seeded data to appear. */
async function gotoCustomers(page: Page): Promise<void> {
  await page.goto('/resources/customers')
  await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toBeVisible({
    timeout: 10_000,
  })
}

/**
 * Open the customers list with a large page size so every record fits on a
 * single page. Used by the bulk-delete spec so it can select fixture rows by
 * unique name without depending on pagination behaviour (which is flaky when
 * orphan records from previously-failed runs shift the "last page" around).
 */
async function gotoCustomersSinglePage(page: Page): Promise<void> {
  await page.goto('/resources/customers?perPage=100')
  await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toBeVisible({
    timeout: 10_000,
  })
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

test.describe('List page — sorting', () => {
  test('clicking the Name header cycles asc → desc and updates the URL', async ({
    page,
  }) => {
    await gotoCustomers(page)

    // The column header for "Name" contains a sort-button with that label.
    const nameHeader = page.getByRole('columnheader', { name: /\bName\b/ })
    const sortBtn = nameHeader.getByRole('button').first()

    // First click → ascending.
    await sortBtn.click()
    await expect(page).toHaveURL(/sortBy=name/, { timeout: 5_000 })
    await expect(page).toHaveURL(/direction=asc/, { timeout: 5_000 })

    // Second click → descending.
    await sortBtn.click()
    await expect(page).toHaveURL(/direction=desc/, { timeout: 5_000 })

    // Third click → clears the sort (URL loses the sortBy param).
    await sortBtn.click()
    await expect(page).not.toHaveURL(/sortBy=name/, { timeout: 5_000 })
  })

  test('sorted rows are reflected in the table (first cell changes)', async ({
    page,
  }) => {
    await gotoCustomers(page)

    // Capture the first name cell before sorting.
    const firstCell = page.locator('tbody tr').first().locator('td').nth(2) // name column (id, email, name…)

    const nameHeader = page.getByRole('columnheader', { name: /\bName\b/ })
    await nameHeader.getByRole('button').first().click()
    // ascending — wait for the URL to update, then verify the first cell value
    // changed (it should now be the alphabetically lowest name).
    await expect(page).toHaveURL(/direction=asc/, { timeout: 5_000 })
    const ascFirst = await firstCell.textContent()

    await nameHeader.getByRole('button').first().click()
    // descending — first cell must differ from ascending first.
    await expect(page).toHaveURL(/direction=desc/, { timeout: 5_000 })
    const descFirst = await firstCell.textContent()

    expect(ascFirst).not.toBe(descFirst)
  })
})

// ─── Per-page selector ────────────────────────────────────────────────────────

test.describe('List page — per-page selector', () => {
  test('changing rows-per-page to 10 updates URL and shows ≤ 10 rows', async ({
    page,
  }) => {
    await gotoCustomers(page)

    // On desktop (1280 × 800) the "Rows per page" label and its select are
    // visible in the sticky paginator. Find the combobox adjacent to that label.
    const perPageCombo = page
      .getByText(/^Rows per page$/i)
      .locator('..')
      .getByRole('combobox')

    await perPageCombo.click()
    await page.getByRole('option', { name: '10', exact: true }).click()

    await expect(page).toHaveURL(/perPage=10/, { timeout: 5_000 })

    // With 30 seeded customers, page 1 of 10 shows exactly 10 rows.
    await expect(page.locator('tbody tr')).toHaveCount(10, { timeout: 5_000 })
  })

  test('changing rows-per-page to 50 shows all 30+ seeded rows on one page', async ({
    page,
  }) => {
    await gotoCustomers(page)

    const perPageCombo = page
      .getByText(/^Rows per page$/i)
      .locator('..')
      .getByRole('combobox')

    await perPageCombo.click()
    await page.getByRole('option', { name: '50', exact: true }).click()

    await expect(page).toHaveURL(/perPage=50/, { timeout: 5_000 })

    // All 30 seeded customers fit on a single page — no second-page button.
    const rows = page.locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(30)
  })
})

// ─── Column visibility ────────────────────────────────────────────────────────

test.describe('List page — column visibility', () => {
  test('unchecking Email in the Columns menu removes the column header', async ({
    page,
  }) => {
    await gotoCustomers(page)

    // Email column is visible by default.
    await expect(page.getByRole('columnheader', { name: /\bEmail\b/ })).toBeVisible()

    // Open the Columns dropdown.
    await page.getByRole('button', { name: /^Columns$/i }).click()

    // Uncheck "Email". The DropdownMenuCheckboxItem has role="menuitemcheckbox".
    const emailCheck = page.getByRole('menuitemcheckbox', { name: /^Email$/i })
    await expect(emailCheck).toBeVisible({ timeout: 3_000 })
    await emailCheck.click()

    // Close the dropdown.
    await page.keyboard.press('Escape')

    // Email column header must be gone.
    await expect(
      page.getByRole('columnheader', { name: /\bEmail\b/ }),
    ).toBeHidden({ timeout: 5_000 })
  })

  test('re-checking a hidden column restores it', async ({ page }) => {
    await gotoCustomers(page)

    const columnsBtn = page.getByRole('button', { name: /^Columns$/i })

    // Hide "Name".
    await columnsBtn.click()
    await page.getByRole('menuitemcheckbox', { name: /^Name$/i }).click()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('columnheader', { name: /\bName\b/ }),
    ).toBeHidden({ timeout: 5_000 })

    // Show "Name" again.
    await columnsBtn.click()
    await page.getByRole('menuitemcheckbox', { name: /^Name$/i }).click()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('columnheader', { name: /\bName\b/ }),
    ).toBeVisible({ timeout: 5_000 })
  })
})

// ─── Bulk delete ──────────────────────────────────────────────────────────────

test.describe('List page — bulk delete', () => {
  test('selects rows, confirms bulk delete and removes records', async ({
    page,
    request,
  }) => {
    const c1 = await createCustomer(request)
    const c2 = await createCustomer(request)

    try {
      // Open the list with perPage=100 so every record (including our two
      // fresh fixtures and any leftovers from other runs) is on a single
      // page. This removes pagination from the equation entirely: row
      // selection is keyed by unique fixture name, so we cannot pick up
      // the wrong record.
      await gotoCustomersSinglePage(page)

      // Wait for both fixture rows.
      await expect(page.getByRole('cell', { name: c1.name })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('cell', { name: c2.name })).toBeVisible()

      // Click the per-row "Select row" checkboxes.
      for (const name of [c1.name, c2.name]) {
        const row = page
          .locator('tbody tr')
          .filter({ has: page.getByRole('cell', { name }) })
        await row.getByRole('checkbox', { name: /Select row/i }).click()
      }

      // Bulk-action toolbar appears.
      const deleteSelectedBtn = page.getByRole('button', { name: /Delete selected/i })
      await expect(deleteSelectedBtn).toBeVisible({ timeout: 5_000 })
      await deleteSelectedBtn.click()

      // Confirmation dialog — click the destructive "Delete" action.
      // Scope the lookup to the alertdialog so we never accidentally match
      // the "Delete selected" toolbar button or a row-actions menu item.
      const confirmDialog = page.getByRole('alertdialog')
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
      const confirmBtn = confirmDialog.getByRole('button', { name: /^Delete$/i })
      await expect(confirmBtn).toBeVisible()
      await confirmBtn.click()
      // Wait for the dialog to close before continuing.
      await expect(confirmDialog).toBeHidden({ timeout: 10_000 })

      // Both rows must disappear from the current page view.
      await expect(
        page.getByRole('cell', { name: c1.name }),
      ).toBeHidden({ timeout: 10_000 })
      await expect(page.getByRole('cell', { name: c2.name })).toBeHidden()

      // Server-side: both records must return 404.
      for (const id of [c1.id, c2.id]) {
        const res = await request.get(
          adminApi(`/resources/customers/records/${id}/actions/show`),
        )
        expect(res.status()).toBe(404)
      }
    } finally {
      // Safety net: silently delete in case the test failed mid-way.
      await deleteCustomerSilently(request, c1.id)
      await deleteCustomerSilently(request, c2.id)
    }
  })
})
