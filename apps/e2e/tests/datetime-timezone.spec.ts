import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Timezone stability of `datetime` properties, browser → API → browser.
 *
 * Regression: `DatePicker` (mode="datetime") used to emit browser-local wall
 * time with no offset (`2026-08-04T15:00`). The Prisma adapter resolved that
 * with a bare `new Date(...)`, which per spec reads an offset-less date-time
 * in the *server process's* timezone. With the browser on UTC+3 and the API on
 * UTC, every save shifted the stored instant by three hours — and because the
 * show/edit views render the instant back in browser-local time, re-saving an
 * untouched record shifted it again, cumulatively.
 *
 * The browser here is pinned to Europe/Moscow (UTC+3) via `timezoneId`; CI and
 * dev machines run the API in whatever `TZ` they happen to have. The assertion
 * that matters is therefore *absolute*: picking 15:00 local must store
 * 12:00:00Z, and must keep storing 12:00:00Z across repeated saves.
 */

test.use({ timezoneId: 'Europe/Moscow' })

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

/** Local wall time the user picks, and the instant it denotes at UTC+3. */
const LOCAL_WALL_TIME = '2026-08-04 15:00'
const EXPECTED_INSTANT = '2026-08-04T12:00:00.000Z'

async function createCustomer(
  request: APIRequestContext,
): Promise<{ id: string; name: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `TZ Test ${suffix}`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: { email: `tz-${suffix}@example.com`, name, tier: 'free' },
  })
  expect(res.ok()).toBeTruthy()
  return { id: String((await res.json()).record.id), name }
}

async function deleteCustomerSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

/** Raw stored value straight from the API, bypassing any browser formatting. */
async function storedLastLoginAt(
  request: APIRequestContext,
  id: string,
): Promise<string> {
  const res = await request.get(
    adminApi(`/resources/customers/records/${id}/actions/show`),
  )
  expect(res.ok()).toBeTruthy()
  return String((await res.json()).record.params.lastLoginAt)
}

/** The DatePicker's text trigger inside the named Field wrapper. */
function fieldInput(page: Page, labelPattern: RegExp) {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: labelPattern }),
    })
    .locator('input')
    .first()
}

async function saveForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Save/i }).first().click()
  await page.waitForURL(/\/resources\/customers\/[^/]+$/, { timeout: 10_000 })
}

test.describe('DateTime timezone round-trip', () => {
  test('stores the picked wall time as the matching UTC instant', async ({
    page,
    request,
  }) => {
    const customer = await createCustomer(request)
    try {
      await page.goto(`/resources/customers/${customer.id}/edit`)
      const input = fieldInput(page, /^Last login/i)
      await expect(input).toBeVisible({ timeout: 10_000 })
      await input.fill(LOCAL_WALL_TIME)
      await input.blur()
      await saveForm(page)

      expect(await storedLastLoginAt(request, customer.id)).toBe(EXPECTED_INSTANT)
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })

  test('re-saving an untouched record does not shift the instant', async ({
    page,
    request,
  }) => {
    const customer = await createCustomer(request)
    try {
      await page.goto(`/resources/customers/${customer.id}/edit`)
      const input = fieldInput(page, /^Last login/i)
      await expect(input).toBeVisible({ timeout: 10_000 })
      await input.fill(LOCAL_WALL_TIME)
      await input.blur()
      await saveForm(page)
      expect(await storedLastLoginAt(request, customer.id)).toBe(EXPECTED_INSTANT)

      // Reload the form: the stored instant must render back as the same local
      // wall time the user typed, and saving it untouched must be a no-op.
      for (let pass = 0; pass < 2; pass++) {
        await page.goto(`/resources/customers/${customer.id}/edit`)
        const reloaded = fieldInput(page, /^Last login/i)
        await expect(reloaded).toHaveValue(LOCAL_WALL_TIME, { timeout: 10_000 })
        await saveForm(page)
        expect(await storedLastLoginAt(request, customer.id)).toBe(EXPECTED_INSTANT)
      }
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })
})
