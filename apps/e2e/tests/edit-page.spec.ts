import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Edit and new-record forms. Verifies:
 *   • Edit form hydrates from the loaded record (input pre-populated with the
 *     stored value).
 *   • Submitting an edit fires a PATCH to the canonical action URL
 *     (`/admin/api/resources/<id>/records/<recordId>/actions/edit`) and
 *     navigates to the show page with the updated value.
 *   • New form refuses submission when required fields are missing
 *     (client-side Zod schema short-circuits the network call).
 *
 * Successful create-from-UI is intentionally out of scope here — the
 * customers fixture has optional date columns whose UI defaults the in-memory
 * adapter rejects with 500, and a successful POST is already exercised
 * end-to-end via `tests/api.spec.ts`.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

async function createCustomer(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string; email: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `Edit Test ${suffix}`
  const email = `edit-${suffix}@example.com`
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

/** Resolve the `<input>` inside the named Field-slotted wrapper. */
function fieldInput(page: Page, labelPattern: RegExp) {
  return page
    .locator('[data-slot="field"]')
    .filter({
      has: page.locator('[data-slot="field-label"]').filter({ hasText: labelPattern }),
    })
    .locator('input')
    .first()
}

test.describe('Edit page — existing record', () => {
  test('hydrates the form from the loaded record', async ({ page, request }) => {
    const customer = await createCustomer(request)
    try {
      await page.goto(`/resources/customers/${customer.id}/edit`)
      // The form is hydrated once the name input shows the seeded value.
      await expect(fieldInput(page, /^Name/)).toHaveValue(customer.name, {
        timeout: 10_000,
      })
      await expect(fieldInput(page, /^Email/)).toHaveValue(customer.email)
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })

  test('saves edits via PATCH and navigates to the show page', async ({
    page,
    request,
  }) => {
    const customer = await createCustomer(request)
    const renamed = `${customer.name} (renamed)`
    try {
      await page.goto(`/resources/customers/${customer.id}/edit`)
      const nameInput = fieldInput(page, /^Name/)
      await expect(nameInput).toHaveValue(customer.name, { timeout: 10_000 })

      await nameInput.fill(renamed)

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(
            `/admin/api/resources/customers/records/${customer.id}/actions/edit`,
          ) && res.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: 'Save' }).click()

      const patchRes = await patchPromise
      expect(patchRes.ok()).toBeTruthy()
      const patchBody = await patchRes.json()
      expect(patchBody.record.params.name).toBe(renamed)

      // After a successful save the edit page redirects to /show.
      await expect(page).toHaveURL(
        new RegExp(`/resources/customers/${customer.id}$`),
        { timeout: 10_000 },
      )
      // Server-side double-check.
      const fetched = await request.get(
        adminApi(`/resources/customers/records/${customer.id}/actions/show`),
      )
      expect(fetched.ok()).toBeTruthy()
      const fetchedBody = await fetched.json()
      expect(fetchedBody.record.params.name).toBe(renamed)
    } finally {
      await deleteCustomerSilently(request, customer.id)
    }
  })
})

test.describe('Edit page — new record', () => {
  test('refuses submission with missing required fields', async ({ page }) => {
    await page.goto('/resources/customers/new')
    // Wait for the form to render — name field present.
    await expect(fieldInput(page, /^Name/)).toBeVisible({ timeout: 10_000 })

    // Submit without filling anything → server is never hit (Zod resolver
    // short-circuits) and we stay on the new-record URL.
    const noPostShouldFire = page
      .waitForRequest(
        (req) =>
          req.url().includes('/admin/api/resources/customers/actions/new') &&
          req.method() === 'POST',
        { timeout: 1500 },
      )
      .catch(() => null)
    await page.getByRole('button', { name: 'Create' }).click()
    const fired = await noPostShouldFire
    expect(fired, 'no POST should fire while validation fails').toBeNull()
    await expect(page).toHaveURL(/\/resources\/customers\/new$/)

    // The required name/email fields surface a "required" message via the
    // Zod resolver.
    await expect(page.getByText(/is required/i).first()).toBeVisible()
  })

  test('creates a record when required fields are filled', async ({
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const email = `create-ui-${suffix}@example.com`
    const name = `Create UI ${suffix}`
    let createdId: string | null = null

    try {
      await page.goto('/resources/customers/new')
      await expect(fieldInput(page, /^Name/)).toBeVisible({ timeout: 10_000 })

      await fieldInput(page, /^Name/).fill(name)
      await fieldInput(page, /^Email/).fill(email)

      // Explicitly pick a tier so the enum field isn't left as empty/null.
      const tierField = page
        .locator('[data-slot="field"]')
        .filter({
          has: page.locator('[data-slot="field-label"]').filter({ hasText: /^Tier/i }),
        })
      const tierCombo = tierField.getByRole('combobox')
      await tierCombo.click()
      await page.getByRole('option', { name: /free/i, exact: false }).first().click()

      const postPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/admin/api/resources/customers/actions/new') &&
          res.request().method() === 'POST',
        { timeout: 10_000 },
      )
      await page.getByRole('button', { name: 'Create' }).click()

      const postRes = await postPromise
      expect(postRes.ok(), `POST failed: ${await postRes.text()}`).toBeTruthy()
      const postBody = await postRes.json()
      createdId = String(postBody.record.id)
      expect(postBody.record.params.name).toBe(name)

      // On success the form navigates to the new record's show page.
      await expect(page).toHaveURL(
        new RegExp(`/resources/customers/${createdId}$`),
        { timeout: 10_000 },
      )
    } finally {
      if (createdId) await deleteCustomerSilently(request, createdId)
    }
  })
})
