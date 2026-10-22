import { expect, test, type APIRequestContext } from '@playwright/test'
import postgres from 'postgres'

/**
 * Show-page rendering. Drives a freshly-created `customers` row so we can
 * assert each field's exact display value end-to-end (UI ↔ REST ↔ adapter).
 * Layout fixes for the show page are covered by `list-page-layout.spec.ts`;
 * here we focus on data rendering and the show ↔ edit navigation pair.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

async function createCustomer(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string; email: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `Show Test ${suffix}`
  const email = `show-${suffix}@example.com`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: {
      email,
      name,
      tier: 'enterprise',
      websiteUrl: 'https://example.com/show-test',
      ...overrides,
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), name, email }
}

async function deleteCustomerSilently(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

test.describe('Show page — field rendering', () => {
  for (const width of [1280, 375]) {
    test(`refresh reads out-of-band updates past both server caches at ${width}px`, async ({
      page,
      request,
    }) => {
      const databaseUrl = process.env.DATABASE_URL
      if (!databaseUrl) throw new Error('Show refresh regression requires DATABASE_URL')
      const pgUrl = new URL(databaseUrl)
      pgUrl.searchParams.delete('schema')
      const sql = postgres(pgUrl.toString(), { max: 1 })
      const customer = await createCustomer(request)
      const showUrl = adminApi(`/resources/customers/records/${customer.id}/actions/show`)
      const query = new URLSearchParams({
        'filters[email][operator]': 'eq',
        'filters[email][value]': customer.email,
      })
      const listUrl = adminApi(`/resources/customers/actions/list?${query}`)
      try {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/resources/customers/${customer.id}`)
        const fields = page.locator('dl').first()
        await expect(fields).toContainText(customer.name)
        await request.get(listUrl)
        const cachedList = await request.get(listUrl)
        expect(cachedList.headers()['x-cache']).toBe('HIT')
        const updatedName = `${customer.name} refreshed`
        await sql`update customer set name = ${updatedName} where id = ${customer.id}`
        const stale = await request.get(showUrl)
        expect(stale.headers()['x-cache']).toBe('HIT')
        expect((await stale.json()).record.params.name).toBe(customer.name)

        const refresh = page
          .getByRole('heading', { name: new RegExp(`customers\\s*#${customer.id}`, 'i') })
          .locator('..')
          .getByRole('button', { name: 'Refresh', exact: true })
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url() === showUrl &&
            response.request().headers()['cache-control'] === 'no-cache',
        )
        await refresh.click()
        const response = await responsePromise
        expect(response.ok()).toBeTruthy()
        expect(response.headers()['x-cache']).toBe('REVALIDATED')
        await expect(fields).toContainText(updatedName)
        await expect(refresh).toBeEnabled()
        const latest = await request.get(listUrl)
        expect((await latest.json()).records[0].params.name).toBe(updatedName)

        const nextName = `${customer.name} refreshed again`
        await sql`update customer set name = ${nextName} where id = ${customer.id}`
        const nextResponse = page.waitForResponse(
          (response) =>
            response.url() === showUrl &&
            response.request().headers()['cache-control'] === 'no-cache',
        )
        await refresh.click()
        expect((await nextResponse).ok()).toBeTruthy()
        await expect(fields).toContainText(nextName)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true)
      } finally {
        await sql.end({ timeout: 5 })
        await deleteCustomerSilently(request, customer.id)
      }
    })
  }

  test('renders the record header, breadcrumbs and seeded field values', async ({
    page,
    request,
  }) => {
    const customer = await createCustomer(request)
    try {
      await page.goto(`/resources/customers/${customer.id}`)

      // Page title bound to the resource + id.
      await expect(
        page.getByRole('heading', { name: new RegExp(`customers\\s*#${customer.id}`, 'i') }),
      ).toBeVisible({ timeout: 10_000 })

      // Breadcrumbs: Home → customers → <recordLabel>. Each row is a link.
      const breadcrumbs = page.getByRole('navigation', { name: /breadcrumb/i })
      await expect(breadcrumbs.getByRole('link', { name: 'Home' })).toBeVisible()
      await expect(breadcrumbs.getByRole('link', { name: /customers/i })).toBeVisible()

      // Field DT/DD pairs: dt label + dd containing the value.
      const showCard = page.locator('dl').first()
      await expect(showCard).toBeVisible()
      // Specific field values we control via the fixture.
      await expect(showCard).toContainText(customer.name)
      await expect(showCard).toContainText(customer.email)
      // Tier dictionary value rendered as-is.
      await expect(showCard).toContainText(/enterprise/i)
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })

  test('header buttons navigate to edit and back to the list', async ({ page, request }) => {
    const customer = await createCustomer(request)
    try {
      await page.goto(`/resources/customers/${customer.id}`)
      await expect(
        page.getByRole('heading', { name: new RegExp(`customers\\s*#${customer.id}`, 'i') }),
      ).toBeVisible({ timeout: 10_000 })

      // Edit jumps to /resources/customers/:id/edit. The "Edit" trigger is
      // rendered as a navigation link (anchor), not a button.
      await page.getByRole('link', { name: 'Edit' }).click()
      await expect(page).toHaveURL(new RegExp(`/resources/customers/${customer.id}/edit$`))
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()

      // Back to show via breadcrumbs, then to list via the `customers` crumb.
      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`/resources/customers/${customer.id}$`))
      await page
        .getByRole('navigation', { name: /breadcrumb/i })
        .getByRole('link', { name: /customers/i })
        .click()
      await expect(page).toHaveURL(/\/resources\/customers$/)
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })

  test('delete from the show page returns to the list', async ({ page, request }) => {
    const customer = await createCustomer(request)
    try {
      await page.goto(`/resources/customers/${customer.id}`)
      await expect(
        page.getByRole('heading', { name: new RegExp(`customers\\s*#${customer.id}`, 'i') }),
      ).toBeVisible({ timeout: 10_000 })

      await page.getByRole('button', { name: 'Delete' }).click()
      const confirmDialog = page
        .getByRole('alertdialog')
        .or(page.getByRole('dialog').filter({ hasText: /Delete this record/i }))
      await confirmDialog.getByRole('button', { name: 'Delete' }).click()

      await expect(page).toHaveURL(/\/resources\/customers$/, { timeout: 10_000 })

      const after = await request.get(
        adminApi(`/resources/customers/records/${customer.id}/actions/show`),
      )
      expect(after.status()).toBe(404)
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })
})
