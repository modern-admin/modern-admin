import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Core CRUD interactions on the resource list page. Exercises the seeded
 * `customers` resource (30 rows ⇒ 2 pages at the default perPage=20) which is
 * the cheapest one to drive scenarios that touch every feature on the table:
 * pagination, filtering, row navigation, the row-actions dropdown and the
 * delete confirmation flow.
 *
 * Every mutating test creates its own fixture row through the REST API and
 * tears it down at the end so we don't drift the seeded counts that other
 * specs rely on.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

/** Create a throw-away customer row via the REST API and return its id. */
async function createCustomer(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string; email: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `E2E Customer ${suffix}`
  const email = `e2e-${suffix}@example.com`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: { email, name, tier: 'pro', ...overrides },
  })
  expect(res.ok(), 'fixture customer should be created').toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name, email }
}

async function deleteCustomerSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  // Best-effort — fixture cleanup runs even when the test left the record in
  // place via the UI, so a 404 here is expected and not a failure.
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

async function gotoCustomers(page: Page): Promise<void> {
  await page.goto('/resources/customers')
  // The list is mounted once at least one seeded row is rendered.
  await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toHaveCount(1, {
    timeout: 15_000,
  })
}

test.describe('List page — CRUD interactions', () => {
  test('paginates to page 2 and updates the URL', async ({ page }) => {
    await gotoCustomers(page)

    // 30 customers ÷ 20 per page = 2 pages → button "2" exists.
    const pagination = page.locator('.sticky.bottom-0')
    const page2Button = pagination.getByRole('button', { name: '2', exact: true })
    await expect(page2Button).toBeVisible()

    // Capture the first-row id before paginating so we can prove the page
    // actually changed (different rows on page 2).
    const firstRowIdBefore = await page
      .locator('tbody tr')
      .first()
      .getAttribute('data-state')
      .catch(() => null)
    const firstRowTextBefore = await page.locator('tbody tr').first().innerText()

    await page2Button.click()
    await expect(page).toHaveURL(/[?&]page=2/)
    // `aria-current="page"` switches to the new active page.
    await expect(
      pagination.getByRole('button', { name: '2', exact: true }),
    ).toHaveAttribute('aria-current', 'page')

    // The first row on page 2 must not match the first row on page 1.
    const firstRowTextAfter = await page.locator('tbody tr').first().innerText()
    expect(firstRowTextAfter).not.toEqual(firstRowTextBefore)
    expect(firstRowIdBefore).not.toBeUndefined()
  })

  test('filters narrow the list and write the filter into the URL', async ({ page }) => {
    await gotoCustomers(page)

    // Open the filter sheet from the toolbar.
    await page.getByRole('button', { name: 'Filters' }).first().click()
    const sheet = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Filters' }) })
    await expect(sheet).toBeVisible()

    // The email column auto-switches to "Is one of" (multi-select) because
    // the 30 seeded customer rows are well below the low-cardinality cap.
    // Flip the operator back to "Contains" so we can drive a free-form text
    // filter — this is the same workflow the UI offers users.
    const opTrigger = sheet.locator(
      'xpath=.//label[normalize-space(.)="Email"]/following::button[1]',
    )
    await opTrigger.click()
    await page.getByRole('option', { name: 'Contains', exact: true }).click()

    const emailInput = sheet.locator(
      'xpath=.//label[normalize-space(.)="Email"]/following::input[1]',
    )
    await emailInput.fill('ada')

    await sheet.getByRole('button', { name: 'Apply filters' }).click()
    await expect(sheet).toBeHidden()

    // URL must persist the filter (TSR encodes the brackets/colon).
    await expect(page).toHaveURL(/filters(\[|%5B)email(\]|%5D)=/)

    // After filtering, only Ada-family customers (seeded handles
    // `ada.lovelace1@example.com`, `ada.allen8@example.com`, …) remain.
    // We assert >0 rows and that no row's text contains an obviously
    // non-Ada-family email.
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const rowTexts = await rows.allInnerTexts()
    expect(rowTexts.length).toBeGreaterThan(0)
    for (const txt of rowTexts) {
      expect(txt.toLowerCase()).toContain('ada')
    }
  })

  test('clicking a data cell navigates to the edit page', async ({ page }) => {
    await gotoCustomers(page)
    // Pick a known cell so we can assert which record we landed on.
    const cell = page.getByRole('cell', { name: 'Ada Lovelace' }).first()
    await cell.click()
    await expect(page).toHaveURL(/\/resources\/customers\/[^/]+\/edit$/)
    // Edit page renders a "Save" submit button — distinct from the show page.
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 10_000 })
  })

  test('row actions menu → Show navigates to the show page', async ({ page }) => {
    await gotoCustomers(page)
    // Open the row-actions menu on the first row. The trigger is the ⋯ button
    // whose `sr-only` text is "Open menu".
    const firstRow = page.locator('tbody tr').first()
    await firstRow.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Show' }).click()
    // /resources/customers/:id (no trailing /edit)
    await expect(page).toHaveURL(/\/resources\/customers\/[^/]+$/)
    // Show page renders an "Edit" button in the header — distinct from list.
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 10_000 })
  })

  test('row actions → Delete removes the record from the list', async ({
    page,
    request,
  }) => {
    // Provision a fixture row we own so we can delete it without disrupting
    // seeded data other specs rely on.
    const fixture = await createCustomer(request)
    try {
      // Open the list with perPage=100 so every record (including our
      // fresh fixture and any leftovers from other runs) is on a single
      // page. Row lookup by unique fixture name is then unambiguous and
      // immune to pagination races.
      await page.goto('/resources/customers?perPage=100')
      await expect(page.getByRole('cell', { name: 'Ada Lovelace' })).toHaveCount(1, {
        timeout: 15_000,
      })

      const fixtureCell = page.getByRole('cell', { name: fixture.name })
      await expect(fixtureCell).toBeVisible({ timeout: 10_000 })

      const fixtureRow = page.locator('tbody tr').filter({ has: fixtureCell })
      await fixtureRow.getByRole('button', { name: 'Open menu' }).click()
      await page
        .getByRole('menu')
        .getByRole('menuitem', { name: 'Delete' })
        .click()

      // A confirmation dialog appears — accept it. Scope the confirm
      // button lookup to the dialog so we cannot accidentally match a
      // row-level "Delete" menu item.
      const confirmDialog = page
        .getByRole('alertdialog')
        .or(page.getByRole('dialog').filter({ hasText: /Delete this record/i }))
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
      await confirmDialog.getByRole('button', { name: /^Delete$/i }).click()
      await expect(confirmDialog).toBeHidden({ timeout: 10_000 })

      // Row vanishes (matches any cell with the fixture name across all pages).
      await expect(page.getByRole('cell', { name: fixture.name })).toHaveCount(0, {
        timeout: 10_000,
      })

      // Verify server-side too.
      const after = await request.get(
        adminApi(`/resources/customers/records/${fixture.id}/actions/show`),
      )
      expect(after.status()).toBe(404)
    } finally {
      await deleteCustomerSilently(request, fixture.id)
    }
  })
})
