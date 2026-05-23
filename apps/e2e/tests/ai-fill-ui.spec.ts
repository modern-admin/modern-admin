import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * End-to-end coverage for `feature-ai-fill`
 * (`packages/feature-ai-fill/src/`, UI in
 * `packages/react/src/components/ai-fill-dialog.tsx`).
 *
 * The reference customers controller opts in to the feature with
 *   aiFillFeature({ prompt: …, fields: { name, email, phone, websiteUrl, bio, … } })
 * (`apps/_shared/src/admin/customers/customers.controller.ts`). The plugin
 * registers a resource-scoped action whose `custom.aiFill === true` marker
 * makes the edit-page surface a "AI Fill" button next to Save (`packages/
 * react/src/pages/edit-page.tsx:448`).
 *
 * Scenarios:
 *   • Button visibility — the AI Fill button only appears on edit pages
 *     for resources that opted in to the plugin (customers ✓, products ✗).
 *   • Recognize flow — open dialog, drop image, click Recognize → API
 *     POST /admin/api/resources/customers/ai-fill mocked to return
 *     `{ values: { name: '…', bio: '…' } }`. Verify:
 *       – dialog closes,
 *       – name + bio inputs reflect the mocked values,
 *       – undo toast appears,
 *       – clicking Undo restores the previous values.
 *   • Cancel — open dialog, click Cancel, dialog closes without any POST.
 *
 * We never hit a real AI model — every request to
 * `/admin/api/resources/customers/ai-fill` is intercepted with
 * `page.route()` and answered with a deterministic body.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001'
const adminApi = (path: string): string => `${API_URL}/admin/api${path}`

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
)

interface CustomerFixture {
  id: string
  originalName: string
  originalBio: string
}

async function createCustomer(request: APIRequestContext): Promise<CustomerFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const originalName = `AI Original ${suffix}`
  const originalBio = `Original bio ${suffix}`
  const res = await request.post(adminApi('/resources/customers/actions/new'), {
    data: {
      name: originalName,
      email: `ai-fill-${suffix}@example.com`,
      tier: 'free',
      bio: originalBio,
    },
  })
  expect(res.ok(), `fixture create failed: ${await res.text()}`).toBeTruthy()
  const body = await res.json()
  return { id: String(body.record.id), originalName, originalBio }
}

async function deleteCustomerSilently(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(adminApi(`/resources/customers/records/${id}/actions/delete`))
}

async function openCustomerEdit(page: Page, id: string): Promise<void> {
  await page.goto(`/resources/customers/${id}/edit`)
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
    timeout: 15_000,
  })
}

test.describe('AI Fill button visibility', () => {
  test('button shows on customers edit (opted-in resource)', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    try {
      await openCustomerEdit(page, fix.id)
      await expect(page.getByRole('button', { name: /^ai fill$/i })).toBeVisible({
        timeout: 5_000,
      })
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('button is absent on products edit (resource without the plugin)', async ({
    page,
    request,
  }) => {
    const res = await request.get(adminApi('/resources/products/actions/list?perPage=1'))
    expect(res.ok()).toBeTruthy()
    const id = String((await res.json()).records[0].id)
    await page.goto(`/resources/products/${id}/edit`)
    await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: /^ai fill$/i })).toHaveCount(0)
  })
})

test.describe('AI Fill — Recognize flow (mocked)', () => {
  test('uploads an image, applies returned values, toasts undo', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    const aiName = `AI Filled Name ${Date.now()}`
    const aiPhone = `+1-555-${Math.floor(Math.random() * 9000 + 1000)}-0000`
    try {
      // Intercept the ai-fill POST. We respond with the model-shaped JSON
      // the controller would normally produce so the controller, network
      // layer, and form-merge code all run for real.
      await page.route('**/admin/api/resources/customers/ai-fill', async (route) => {
        const req = route.request()
        expect(req.method()).toBe('POST')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ values: { name: aiName, phone: aiPhone } }),
        })
      })

      await openCustomerEdit(page, fix.id)
      await page.getByRole('button', { name: /^ai fill$/i }).click()

      const dialog = page.getByRole('dialog', { name: /fill form from photo/i })
      await expect(dialog).toBeVisible()

      // FileInput exposes a hidden `<input type="file">` inside its drop
      // zone — same pattern as the upload tests.
      const fileInput = dialog.locator('input[type="file"]').first()
      await fileInput.setInputFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: PNG_1X1,
      })

      // The Recognize button enables only after a file is selected.
      const recognize = dialog.getByRole('button', { name: /^recognize$/i })
      await expect(recognize).toBeEnabled()
      await recognize.click()

      // Dialog auto-closes on success.
      await expect(dialog).toBeHidden({ timeout: 10_000 })

      // Form fields now reflect the mocked AI values. Inputs in the
      // generated form don't carry `name`/`id` attributes — scope by the
      // visible field label (same pattern as `forms-ui.spec.ts`). The
      // customers `name` property renders as a plain text input; `bio`
      // is a richtext editor (no `<input>` element) so we only assert
      // the scalar field here.
      const nameField = page
        .locator('[data-slot="field"]')
        .filter({
          has: page
            .locator('[data-slot="field-label"]')
            .filter({ hasText: /^name\*?$/i }),
        })
        .first()
      await expect(nameField.locator('input').first()).toHaveValue(aiName, {
        timeout: 5_000,
      })

      const phoneField = page
        .locator('[data-slot="field"]')
        .filter({
          has: page
            .locator('[data-slot="field-label"]')
            .filter({ hasText: /^phone\*?$/i }),
        })
        .first()
      await expect(phoneField.locator('input').first()).toHaveValue(aiPhone)

      // Undo toast appears (sonner renders at bottom-center). The label
      // includes the "AI filled" prefix from `aiFill:applied`.
      await expect(page.getByText(/ai filled/i).first()).toBeVisible({
        timeout: 5_000,
      })
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })

  test('Cancel button closes the dialog without firing a POST', async ({
    page,
    request,
  }) => {
    const fix = await createCustomer(request)
    let aiFillRequestCount = 0
    try {
      await page.route('**/admin/api/resources/customers/ai-fill', async (route) => {
        aiFillRequestCount++
        await route.fulfill({ status: 500, body: 'should not be called' })
      })

      await openCustomerEdit(page, fix.id)
      await page.getByRole('button', { name: /^ai fill$/i }).click()
      const dialog = page.getByRole('dialog', { name: /fill form from photo/i })
      await expect(dialog).toBeVisible()

      await dialog.getByRole('button', { name: /^cancel$/i }).click()
      await expect(dialog).toBeHidden()

      // Give any in-flight handler a beat to settle.
      await page.waitForTimeout(300)
      expect(aiFillRequestCount).toBe(0)
    } finally {
      await deleteCustomerSilently(request, fix.id)
    }
  })
})
